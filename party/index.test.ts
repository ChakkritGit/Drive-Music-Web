import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("partyserver", () => ({
  Server: class {
    ctx = { storage: { get: vi.fn(), put: vi.fn(), getAlarm: vi.fn(async () => null), setAlarm: vi.fn() } };
    broadcast = vi.fn();
    getConnection = vi.fn();
  },
  routePartykitRequest: vi.fn(async () => null),
}));
import worker, { SyncServer } from "./index";
import { LEASE_MS, PARTY_PROTOCOL, reducePlayback } from "../src/lib/party";
import type { Connection } from "partyserver";
const connection = (id: string) => ({ id, send: vi.fn(), close: vi.fn() }) as unknown as Connection;
const playback = reducePlayback(null, { type: "play", queue: ["a", "b", "c"].map(id => ({ id, name: id, mimeType: "audio/mpeg" })), index: 0 }, 1000)!;
const send = (server: SyncServer, c: Connection, m: object) => server.onMessage(c, JSON.stringify(m));
class TestSyncServer extends SyncServer { get storage() { return this.ctx.storage; } }
describe("Party room", () => {
  let server: TestSyncServer;
  const a = connection("a"), b = connection("b"), c = connection("c");
  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    server = new TestSyncServer({} as never, {} as never);
    for (const conn of [a, b, c]) await send(server, conn, { type: "hello", protocol: PARTY_PROTOCOL, name: conn.id });
  });
  it("lists idle devices even before any music is playing", () => {
    expect(server.room.devices.map(d => d.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps state during handoff and waits for the old output to acknowledge silence", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    expect(server.room.outputId).toBeNull();
    expect(server.room.pendingOutputId).toBe("b");
    expect(server.room.playback?.queue).toEqual(playback.queue);
    await send(server, c, { type: "released", revision: server.room.revision });
    expect(server.room.outputId).toBeNull();
    await send(server, a, { type: "released", revision: server.room.revision });
    expect(server.room.outputId).toBe("b");
    expect(server.room.playback?.isPlaying).toBe(true);
  });
  it("rejects reports from controllers and old command revisions", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    const rev = server.room.revision;
    await send(server, c, { type: "command", command: { type: "next" } });
    await send(server, a, { type: "report", revision: rev, playback });
    await send(server, b, { type: "report", revision: server.room.revision, playback });
    expect(server.room.playback?.currentIndex).toBe(1);
  });
  it("accepts shared controls from every connected device", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "command", command: { type: "next" } });
    await send(server, c, { type: "command", command: { type: "toggle" } });
    expect(server.room.playback?.currentIndex).toBe(1);
    expect(server.room.playback?.isPlaying).toBe(false);
  });
  it("does not grant an old output a renewed lease while switching", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    await send(server, a, { type: "heartbeat", sent: 42 });
    expect(a.send).toHaveBeenLastCalledWith(expect.stringContaining('"granted":false'));
  });
  it("waits for lease expiry before recovering an unresponsive output", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    vi.setSystemTime(1000 + LEASE_MS - 1);
    await send(server, b, { type: "heartbeat", sent: 42 });
    await server.onAlarm(); expect(server.room.outputId).toBeNull();
    vi.setSystemTime(1000 + LEASE_MS + 1);
    await server.onAlarm(); expect(server.room.outputId).toBe("b");
  });
  it("requests heartbeats independently of background browser timers", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    vi.setSystemTime(21_000);
    await server.onAlarm();
    expect(server.room.outputId).toBe("a");
    expect(a.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "heartbeat-request" }));
    await send(server, a, { type: "heartbeat", sent: 20_000 });
    expect(a.send).toHaveBeenLastCalledWith(expect.stringContaining(`"leaseMs":${LEASE_MS}`));
  });
  it("does not postpone scheduled heartbeats when frequent playback reports arrive", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    vi.mocked(server.storage.getAlarm).mockResolvedValue(3500);
    vi.mocked(server.storage.setAlarm).mockClear();
    for (const at of [2000, 2500, 3000]) {
      vi.setSystemTime(at);
      await send(server, a, { type: "report", revision: server.room.revision, playback });
    }
    expect(server.storage.setAlarm).not.toHaveBeenCalled();
    vi.setSystemTime(3500);
    await server.onAlarm();
    expect(a.send).toHaveBeenLastCalledWith(JSON.stringify({ type: "heartbeat-request" }));
    expect(server.storage.setAlarm).toHaveBeenCalledWith(6000);
  });
  it("preserves playback through a brief output socket reconnect", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, a, { type: "heartbeat", sent: 0 });
    const revision = server.room.revision;
    const transport = server.room.transportRevision;
    await server.onClose(a);
    expect(server.room.devices.map(d => d.id)).toEqual(["b", "c"]);
    vi.setSystemTime(16_000);
    await server.onAlarm();
    expect(server.room.outputId).toBe("a");
    expect(server.room.playback?.isPlaying).toBe(true);
    const reconnected = connection("a");
    await send(server, reconnected, { type: "hello", protocol: PARTY_PROTOCOL, name: "a" });
    await send(server, reconnected, { type: "heartbeat", sent: 15_000 });
    await server.onClose(a);
    expect(server.room.devices.map(d => d.id)).toContain("a");
    expect(server.room.revision).toBe(revision);
    expect(server.room.transportRevision).toBe(transport);
    expect(reconnected.send).toHaveBeenLastCalledWith(expect.stringContaining('"granted":true'));
  });
  it("retains exclusivity when a disconnected output cannot acknowledge handoff", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, a, { type: "heartbeat", sent: 0 });
    await server.onClose(a);
    vi.setSystemTime(10_000);
    await send(server, b, { type: "output", id: "b" });
    expect(server.room.outputId).toBeNull();
    expect(server.room.pendingOutputId).toBe("b");
    vi.setSystemTime(1000 + LEASE_MS - 1);
    await server.onAlarm();
    expect(server.room.outputId).toBeNull();
    await send(server, b, { type: "heartbeat", sent: LEASE_MS - 1 });
    vi.setSystemTime(1000 + LEASE_MS + 1);
    await server.onAlarm();
    expect(server.room.outputId).toBe("b");
    expect(server.room.playback?.isPlaying).toBe(true);
  });
  it("pauses an output only once its outstanding lease expires", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await server.onClose(a);
    vi.setSystemTime(1000 + LEASE_MS);
    await server.onAlarm();
    expect(server.room.outputId).toBeNull();
    expect(server.room.playback?.isPlaying).toBe(false);
  });
  it("does not extend a handoff deadline for heartbeats from the released output", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, a, { type: "heartbeat", sent: 0 });
    await send(server, b, { type: "output", id: "b" });
    const deadline = server.releasing?.until;
    vi.setSystemTime(10_000);
    await send(server, a, { type: "heartbeat", sent: 9000 });
    expect(server.releasing?.until).toBe(deadline);
  });
  it("does not accept legacy relay messages or malformed payloads", async () => {
    await server.onMessage(a, "null");
    await server.onMessage(a, "{broken");
    await send(server, a, playback);
    await send(server, a, { type: "command", command: { type: "play", queue: [], index: 0 } });
    expect(server.room.playback).toBeNull();
  });
  it("updates queue revisions without restarting transport", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    const transport = server.room.transportRevision;
    const revision = server.room.revision;
    await send(server, b, { type: "command", command: { type: "insert", file: playback.queue[2] } });
    expect(server.room.revision).toBeGreaterThan(revision);
    expect(server.room.transportRevision).toBe(transport);
    await send(server, c, { type: "command", command: { type: "remove", index: 1, fileId: "c" } });
    expect(server.room.transportRevision).toBe(transport);
    expect(server.room.playback?.queue.map(f => f.id)).toEqual(["a", "b"]);
  });
  it("retains a seek version when queue edits arrive before the output can apply it", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    const before = server.room.transportRevision;
    await send(server, b, { type: "command", command: { type: "seek", seconds: 0.2 } });
    const sought = server.room.transportRevision;
    await send(server, c, { type: "command", command: { type: "insert", file: playback.queue[2] } });
    expect(sought).not.toBe(before);
    expect(server.room.transportRevision).toBe(sought);
    expect(server.room.playback?.progress).toBe(0.2);
  });
  it("versions playback when inserting into an empty room", async () => {
    await send(server, a, { type: "command", command: { type: "insert", file: playback.queue[0] } });
    expect(server.room.transportRevision).toBe(server.room.revision);
    expect(server.room.playback?.isPlaying).toBe(true);
  });
  it("exposes a public health check without exposing room data", async () => {
    const response = await worker.fetch(new Request("https://worker/health"), { PARTY_TOKEN_SECRET: "configured" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "drive-music-sync", protocol: PARTY_PROTOCOL });
    expect((await worker.fetch(new Request("https://worker/health"), { PARTY_TOKEN_SECRET: "" })).status).toBe(503);
  });
});

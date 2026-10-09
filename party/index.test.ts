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
import { HANDOFF_MS, LEASE_MS, PARTY_PROTOCOL, canPreservePosition, reducePlayback } from "../src/lib/party";
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
  it("transfers an unresponsive output after a short handoff deadline without waiting for its lease", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    expect(server.releasing?.until).toBe(1000 + HANDOFF_MS);
    expect(server.devices.get("a")?.leaseUntil).toBe(1000 + LEASE_MS);
    expect(server.storage.setAlarm).toHaveBeenLastCalledWith(1000 + HANDOFF_MS);
    vi.setSystemTime(1000 + HANDOFF_MS - 1);
    await send(server, b, { type: "heartbeat", sent: 42 });
    await server.onAlarm(); expect(server.room.outputId).toBeNull();
    expect(server.storage.setAlarm).toHaveBeenLastCalledWith(1000 + HANDOFF_MS);
    vi.setSystemTime(1000 + HANDOFF_MS);
    await server.onAlarm(); expect(server.room.outputId).toBe("b");
    expect(server.devices.has("a")).toBe(true);
    expect(server.room.playback?.isPlaying).toBe(true);
  });
  it("does not extend a pending handoff or discard its commands when output selection is retried", async () => {
    await send(server, b, { type: "hello", protocol: PARTY_PROTOCOL, name: "b", commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    const revision = server.room.revision;
    const deadline = server.releasing?.until;
    await send(server, c, { type: "command", command: { type: "seek", seconds: 30 } });
    vi.setSystemTime(1000 + HANDOFF_MS - 200);
    await send(server, b, { type: "output", id: "b" });
    expect(server.room.revision).toBe(revision);
    expect(server.releasing?.until).toBe(deadline);
    expect(server.pendingCommands).toEqual([{ type: "seek", seconds: 30 }]);
    vi.setSystemTime(1000 + HANDOFF_MS);
    await server.onAlarm();
    const commands = vi.mocked(b.send).mock.calls.map(([raw]) => JSON.parse(raw as string)).filter(m => m.type === "player-command");
    expect(server.room.outputId).toBe("b");
    expect(commands).toHaveLength(1);
    expect(commands[0].command).toEqual({ type: "seek", seconds: 30 });
  });
  it("grants only the latest target without extending the original deadline", async () => {
    await send(server, c, { type: "hello", protocol: PARTY_PROTOCOL, name: "c", commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    const staleRevision = server.room.revision;
    const deadline = server.releasing?.until;
    await send(server, b, { type: "command", command: { type: "seek", seconds: 30 } });
    vi.setSystemTime(1000 + HANDOFF_MS - 200);
    await send(server, c, { type: "output", id: "c" });
    expect(server.releasing?.until).toBe(deadline);
    expect(server.pendingCommands).toEqual([]);
    await send(server, a, { type: "released", revision: staleRevision });
    expect(server.room.outputId).toBeNull();
    await send(server, b, { type: "command", command: { type: "playing", value: false } });
    vi.setSystemTime(1000 + HANDOFF_MS);
    await server.onAlarm();
    expect(server.room.outputId).toBe("c");
    expect(server.room.pendingOutputId).toBeNull();
    const commands = vi.mocked(c.send).mock.calls.map(([raw]) => JSON.parse(raw as string)).filter(m => m.type === "player-command");
    expect(commands).toHaveLength(1);
    expect(commands[0].command).toEqual({ type: "playing", value: false });
    const generation = server.room.outputGeneration;
    await send(server, a, { type: "released", revision: staleRevision });
    await send(server, a, { type: "report", revision: server.room.revision, playback: { ...playback, isPlaying: false } });
    expect(server.room.outputId).toBe("c");
    expect(server.room.outputGeneration).toBe(generation);
    expect(server.room.playback?.isPlaying).toBe(true);
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
  it("terminates a refreshed output immediately and lets its new socket take over", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, a, { type: "heartbeat", sent: 0 });
    vi.setSystemTime(3000);
    await server.onClose(a);
    expect(server.devices.has("a")).toBe(false);
    expect(server.room.devices.map(d => d.id)).toEqual(["b", "c"]);
    expect(server.room.outputId).toBeNull();
    expect(server.releasing).toBeNull();
    expect(server.room.playback).toMatchObject({ isPlaying: false, progress: 2, queue: playback.queue });
    const refreshed = connection("refreshed-tab");
    await send(server, refreshed, { type: "hello", protocol: PARTY_PROTOCOL, name: "a" });
    await send(server, refreshed, { type: "output", id: refreshed.id });
    expect(server.room.outputId).toBe(refreshed.id);
    expect(server.room.pendingOutputId).toBeNull();
    await send(server, refreshed, { type: "command", command: { type: "playing", value: true } });
    expect(server.room.playback?.isPlaying).toBe(true);
  });
  it("does not evict a replacement socket when the old socket closes late", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    const revision = server.room.revision;
    const reconnected = connection("a");
    await send(server, reconnected, { type: "hello", protocol: PARTY_PROTOCOL, name: "a" });
    await server.onClose(a);
    expect(server.room.devices.map(d => d.id)).toContain("a");
    expect(server.room.revision).toBe(revision);
    expect(server.room.outputId).toBe("a");
    await send(server, reconnected, { type: "heartbeat", sent: 0 });
    expect(reconnected.send).toHaveBeenLastCalledWith(expect.stringContaining('"granted":true'));
  });
  it("switches immediately when the old output disconnects during a handoff", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, a, { type: "heartbeat", sent: 0 });
    await send(server, b, { type: "output", id: "b" });
    expect(server.room.outputId).toBeNull();
    expect(server.room.pendingOutputId).toBe("b");
    await server.onClose(a);
    expect(server.room.outputId).toBe("b");
    expect(server.room.pendingOutputId).toBeNull();
    expect(server.releasing).toBeNull();
    expect(server.room.playback?.isPlaying).toBe(true);
  });
  it("allows another device to take output immediately after a disconnect", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await server.onClose(a);
    expect(server.room.outputId).toBeNull();
    expect(server.room.playback?.isPlaying).toBe(false);
    await send(server, b, { type: "output", id: "b" });
    expect(server.room.outputId).toBe("b");
    expect(server.releasing).toBeNull();
  });
  it("clears a disconnected pending target without granting it output later", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    await server.onClose(b);
    expect(server.room.pendingOutputId).toBeNull();
    await send(server, a, { type: "released", revision: server.room.revision });
    expect(server.room.outputId).toBeNull();
    expect(server.room.playback?.isPlaying).toBe(false);
  });
  it("terminates errored sockets and ignores their later messages and close events", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await server.onError(a);
    const revision = server.room.revision;
    expect(a.close).toHaveBeenCalledWith(1011, "Connection failed");
    expect(server.room.outputId).toBeNull();
    await send(server, a, { type: "report", revision, playback });
    await send(server, a, { type: "command", command: { type: "next" } });
    await server.onClose(a);
    expect(server.room.revision).toBe(revision);
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
    const position = server.room.positionRevision;
    const revision = server.room.revision;
    await send(server, b, { type: "command", command: { type: "insert", file: playback.queue[2] } });
    expect(server.room.revision).toBeGreaterThan(revision);
    expect(server.room.transportRevision).toBe(transport);
    expect(server.room.positionRevision).toBe(position);
    await send(server, c, { type: "command", command: { type: "remove", index: 1, fileId: "c" } });
    expect(server.room.transportRevision).toBe(transport);
    expect(server.room.positionRevision).toBe(position);
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
    expect(server.room.positionRevision).toBe(server.room.revision);
    expect(server.room.playback?.isPlaying).toBe(true);
  });
  it("changes play state without requesting another seek to the shared clock", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    const position = server.room.positionRevision;
    for (const command of [{ type: "toggle" }, { type: "playing", value: true }, { type: "playing", value: false }]) {
      const transport = server.room.transportRevision;
      await send(server, b, { type: "command", command });
      expect(server.room.positionRevision).toBe(position);
      expect(server.room.transportRevision).toBeGreaterThan(transport!);
    }
  });
  it("retains a pending seek through pause/resume and queue edits", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    const applied = { ...server.room };
    await send(server, b, { type: "command", command: { type: "seek", seconds: 37 } });
    const sought = server.room.positionRevision;
    expect(sought).toBe(server.room.revision);
    await send(server, b, { type: "command", command: { type: "playing", value: false } });
    await send(server, c, { type: "command", command: { type: "insert", file: playback.queue[2] } });
    await send(server, b, { type: "command", command: { type: "playing", value: true } });
    expect(server.room.positionRevision).toBe(sought);
    expect(server.room.playback?.progress).toBe(37);
    expect(canPreservePosition(applied, server.room)).toBe(false);
  });
  it("requests a new position for track selection, skips and handoff", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    for (const command of [{ type: "next" }, { type: "previous" }, { type: "play", queue: playback.queue, index: 0 }]) {
      const position = server.room.positionRevision;
      await send(server, b, { type: "command", command });
      expect(server.room.positionRevision).toBeGreaterThan(position!);
      expect(server.room.positionRevision).toBe(server.room.revision);
    }
    const beforeHandoff = server.room.positionRevision;
    await send(server, b, { type: "output", id: "b" });
    await send(server, a, { type: "released", revision: server.room.revision });
    expect(server.room.outputId).toBe("b");
    expect(server.room.positionRevision).toBeGreaterThan(beforeHandoff!);
    expect(server.room.positionRevision).toBe(server.room.revision);
  });
  it("does not seek the output again after it reports an automatic transition", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    const applied = { ...server.room };
    await send(server, a, { type: "report", revision: server.room.revision,
      playback: { ...playback, currentIndex: 1, progress: 3, isPlaying: true } });
    expect(server.room.playback?.currentIndex).toBe(1);
    expect(server.room.positionRevision).toBe(applied.positionRevision);
    await send(server, b, { type: "command", command: { type: "toggle" } });
    expect(canPreservePosition(applied, server.room)).toBe(true);
  });
  it("routes modern controls to the output without reducing its playback mirror", async () => {
    await send(server, a, { type: "hello", protocol: PARTY_PROTOCOL, name: "a", commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    const generation = server.room.outputGeneration;
    const actual = server.room.playback;
    vi.mocked(a.send).mockClear(); vi.mocked(b.send).mockClear();
    await send(server, b, { type: "command", command: { type: "seek", seconds: 42 } });
    expect(server.room.controlMode).toBe("commands");
    expect(server.room.playback).toBe(actual);
    expect(a.send).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ type: "player-command", protocol: PARTY_PROTOCOL,
      outputId: "a", outputGeneration: generation, revision: 1, command: { type: "seek", seconds: 42 } }));
    expect(b.send).not.toHaveBeenCalled();
    await send(server, a, { type: "report", outputGeneration: generation, commandRevision: 1, playback: { ...playback, progress: 42 } });
    expect(server.room.playback?.progress).toBe(42);
  });
  it("rejects snapshots predating a modern command or belonging to a previous output grant", async () => {
    await send(server, a, { type: "hello", protocol: PARTY_PROTOCOL, name: "a", commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    const generation = server.room.outputGeneration!;
    await send(server, b, { type: "command", command: { type: "playing", value: false } });
    const paused = { ...playback, isPlaying: false };
    await send(server, a, { type: "report", outputGeneration: generation, commandRevision: 0, playback: paused });
    await send(server, a, { type: "report", outputGeneration: generation - 1, commandRevision: 1, playback: paused });
    expect(server.room.playback?.isPlaying).toBe(true);
    await send(server, a, { type: "report", outputGeneration: generation, commandRevision: 1, playback: paused });
    expect(server.room.playback?.isPlaying).toBe(false);
  });
  it("accepts native automatic transitions and keeps the next remote command relative to the real player", async () => {
    await send(server, a, { type: "hello", protocol: PARTY_PROTOCOL, name: "a", commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, a, { type: "report", outputGeneration: server.room.outputGeneration, commandRevision: 0,
      playback: { ...playback, currentIndex: 1, progress: 7 } });
    await send(server, b, { type: "command", command: { type: "next" } });
    expect(server.room.playback).toMatchObject({ currentIndex: 1, progress: 7, isPlaying: true });
    expect(a.send).toHaveBeenLastCalledWith(expect.stringContaining('"command":{"type":"next"}'));
  });
  it("queues remote controls through handoff and sends each once to the newly granted output", async () => {
    await send(server, b, { type: "hello", protocol: PARTY_PROTOCOL, name: "b", commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b" });
    vi.mocked(b.send).mockClear();
    await send(server, c, { type: "command", command: { type: "seek", seconds: 30 } });
    await send(server, c, { type: "command", command: { type: "playing", value: false } });
    expect(b.send).not.toHaveBeenCalled();
    expect(server.room.playback?.isPlaying).toBe(true);
    await send(server, a, { type: "released", revision: server.room.revision });
    const messages = vi.mocked(b.send).mock.calls.map(([raw]) => JSON.parse(raw as string));
    expect(messages.map(m => [m.revision, m.command])).toEqual([[1, { type: "seek", seconds: 30 }], [2, { type: "playing", value: false }]]);
    expect(messages.every(m => m.outputGeneration === server.room.outputGeneration)).toBe(true);
    expect(server.pendingCommands).toEqual([]);
    expect(server.room.playback?.isPlaying).toBe(true);
    await send(server, b, { type: "report", outputGeneration: server.room.outputGeneration, commandRevision: 2,
      playback: { ...playback, progress: 30, isPlaying: false } });
    expect(server.room.playback).toMatchObject({ progress: 30, isPlaying: false });
  });
  it("resets command acknowledgements on a new output generation", async () => {
    for (const conn of [a, b]) await send(server, conn, { type: "hello", protocol: PARTY_PROTOCOL, name: conn.id, commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, c, { type: "command", command: { type: "next" } });
    const previousGeneration = server.room.outputGeneration!;
    await send(server, b, { type: "output", id: "b" });
    await send(server, a, { type: "released", revision: server.room.revision });
    expect(server.room.outputGeneration).toBeGreaterThan(previousGeneration);
    expect(server.room.commandRevision).toBe(0);
    await send(server, b, { type: "report", outputGeneration: server.room.outputGeneration, commandRevision: 0,
      playback: { ...playback, progress: 64 } });
    expect(server.room.playback?.progress).toBe(64);
  });
  it("adopts a continuing local player when rejoining a room with no active output", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await server.onClose(a);
    expect(server.room.playback?.isPlaying).toBe(false);
    await send(server, b, { type: "hello", protocol: PARTY_PROTOCOL, name: "b", commands: true });
    await send(server, b, { type: "output", id: "b", seed: { ...playback, currentIndex: 2, progress: 41, isPlaying: true } });
    expect(server.room.playback).toMatchObject({ currentIndex: 2, progress: 41, isPlaying: true });
  });
  it("keeps a live output's snapshot during handoff despite a controller's stale local seed", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b", seed: { ...playback, currentIndex: 2, isPlaying: false } });
    expect(server.room.playback).toMatchObject({ currentIndex: 0, isPlaying: true });
  });
  it("adopts an explicitly started local player when its delayed handoff grant completes", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b", adoptLocal: true,
      seed: { ...playback, currentIndex: 2, progress: 41, isPlaying: true } });
    expect(server.room.playback).toMatchObject({ currentIndex: 0, progress: 0 });
    vi.setSystemTime(1000 + HANDOFF_MS);
    await server.onAlarm();
    expect(server.room.outputId).toBe("b");
    expect(server.room.playback).toMatchObject({ currentIndex: 2, progress: 41, isPlaying: true });
    expect(server.pendingLocalPlayback).toBeNull();
  });
  it("does not adopt another device's seed or a canceled target's local playback", async () => {
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "output", id: "b", adoptLocal: true,
      seed: { ...playback, currentIndex: 2, progress: 41 } });
    await send(server, b, { type: "output", id: "c", adoptLocal: true,
      seed: { ...playback, currentIndex: 1, progress: 20 } });
    vi.setSystemTime(1000 + HANDOFF_MS);
    await server.onAlarm();
    expect(server.room.outputId).toBe("c");
    expect(server.room.playback).toMatchObject({ currentIndex: 0, progress: 0 });
  });
  it("lets a reconnected output relinquish only its Party session immediately", async () => {
    await send(server, a, { type: "hello", protocol: PARTY_PROTOCOL, name: "a", commands: true });
    await send(server, a, { type: "output", id: "a", seed: playback });
    await send(server, b, { type: "detach" });
    expect(server.room.outputId).toBe("a");
    await send(server, a, { type: "detach" });
    expect(server.room.outputId).toBeNull();
    expect(server.room.pendingOutputId).toBeNull();
    expect(server.releasing).toBeNull();
    expect(server.devices.has("a")).toBe(true);
    expect(server.room.playback?.isPlaying).toBe(false);
  });
  it("exposes a public health check without exposing room data", async () => {
    const response = await worker.fetch(new Request("https://worker/health"), { PARTY_TOKEN_SECRET: "configured" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "drive-music-sync", protocol: PARTY_PROTOCOL });
    expect((await worker.fetch(new Request("https://worker/health"), { PARTY_TOKEN_SECRET: "" })).status).toBe(503);
  });
});

// @vitest-environment happy-dom

import { act, createElement, useLayoutEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedPlayerProvider, usePlayer, type PlayerContextValue } from "./PlayerContext";
import { SyncProvider, useSync } from "./SyncContext";
import type { PartyCommand, PartyPlayback, PartyRoom } from "@/lib/party";

type SocketOptions = { onMessage: (event: { data: string }) => void; onClose: () => void; onError: () => void };
const socketMock = vi.hoisted(() => ({
  options: null as SocketOptions | null,
  socket: { readyState: 1, send: vi.fn(), close: vi.fn(), reconnect: vi.fn() },
}));
vi.mock("partysocket/react", () => ({ default: (options: SocketOptions) => {
  socketMock.options = options;
  return socketMock.socket;
} }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated", data: { user: { email: "test@example.com" } } }) }));
vi.mock("@/components/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/components/PlayerContext", async () => {
  const { createContext, useContext } = await import("react");
  const context = createContext<PlayerContextValue | null>(null);
  return { SharedPlayerProvider: context.Provider, usePlayer: () => useContext(context)! };
});

const queue = ["first", "second", "third"].map(id => ({ id, name: `${id}.mp3`, mimeType: "audio/mpeg" }));
const playback = (overrides: Partial<PartyPlayback> = {}): PartyPlayback => ({
  queue, currentIndex: 0, source: null, progress: 12, duration: 120,
  isPlaying: true, shuffle: false, shuffleOrder: [], playNextIndex: null,
  loopMode: "off", meta: null, updatedAt: Date.now(), ...overrides,
});
const room = (overrides: Partial<PartyRoom> = {}): PartyRoom => ({
  type: "room", protocol: 2, revision: 1, outputGeneration: 1, commandRevision: 0, controlMode: "commands",
  devices: [{ id: "local", name: "This device" }, { id: "remote", name: "Remote" }],
  outputId: "local", pendingOutputId: null, playback: playback(), ...overrides,
});

let root: Root;
let container: HTMLDivElement;
let shared: PlayerContextValue;
let sync: ReturnType<typeof useSync>;
let setLocal: (patch: Partial<PlayerContextValue>) => void;
let local: PlayerContextValue;
const execute = vi.fn();
const hydrate = vi.fn();
const mute = vi.fn();
const leaseMode = vi.fn();
const mediaHandler = vi.fn();
const noop = () => {};

function Probe() {
  const p = usePlayer();
  const s = useSync();
  useLayoutEffect(() => { shared = p; sync = s; });
  return null;
}
function Harness() {
  const [state, setState] = useState<PlayerContextValue>(() => ({
    ...playback(), currentFile: queue[0], currentMeta: null, currentSource: null,
    cachedTracks: new Map(), upNext: [], syncRevision: -1, isLoading: false, isPreviewingTransition: false,
  } as unknown as PlayerContextValue));
  const methods = useMemo(() => ({
    executePartyCommand: (command: PartyCommand) => {
      execute(command);
      setState(previous => {
        if (command.type === "seek") return { ...previous, progress: command.seconds };
        if (command.type === "playing") return { ...previous, isPlaying: command.value };
        if (command.type === "toggle") return { ...previous, isPlaying: !previous.isPlaying };
        if (command.type === "next") {
          const index = ((previous.currentIndex ?? 0) + 1) % queue.length;
          return { ...previous, currentIndex: index, currentFile: queue[index], progress: 0 };
        }
        return { ...previous };
      });
    },
    applyPartyPlayback: (p: PartyPlayback, revision: number) => {
      hydrate(p, revision);
      setState(previous => ({ ...previous, ...p, currentFile: p.queue[p.currentIndex], syncRevision: revision }));
    },
    setOutputMuted: (muted: boolean, reason?: string) => {
      mute(muted, reason);
      if (muted) setState(previous => previous.isPlaying ? { ...previous, isPlaying: false } : previous);
    },
    setPartyLeaseRequired: leaseMode, grantPartyLease: noop, unlockAudio: noop,
    setPartyCommandHandler: mediaHandler, previewTransition: async () => {},
  }), []);
  const value = useMemo(() => ({ ...state, ...methods }), [state, methods]);
  useLayoutEffect(() => {
    local = value;
    setLocal = patch => setState(previous => ({ ...previous, ...patch }));
  });
  return createElement(SharedPlayerProvider, { value },
    createElement(SyncProvider, null, createElement(Probe)));
}
async function message(value: unknown) {
  await act(async () => { socketMock.options!.onMessage({ data: JSON.stringify(value) }); });
}
async function acquire(p: PartyRoom = room(), leaseMs = 90000) {
  await message({ type: "welcome", deviceId: "local" });
  await message(p);
  await message({ type: "lease", granted: true, sent: performance.now(), leaseMs });
}
function sent(type: string) {
  return socketMock.socket.send.mock.calls.map(([raw]) => JSON.parse(raw as string)).filter(m => m.type === type);
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "example.test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "test", roomId: "test" }) }));
  for (const mock of [execute, hydrate, mute, leaseMode, mediaHandler, socketMock.socket.send, socketMock.socket.close, socketMock.socket.reconnect]) mock.mockClear();
  socketMock.socket.readyState = 1;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(Harness)); });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("Party command bridge", () => {
  it("hydrates once, then local seek and play controls run immediately without a network command", async () => {
    await acquire();
    expect(hydrate).toHaveBeenCalledTimes(1);
    socketMock.socket.send.mockClear();
    await act(async () => { shared.seek(55); });
    expect(execute).toHaveBeenLastCalledWith({ type: "seek", seconds: 55 });
    expect(shared.progress).toBe(55);
    await act(async () => { shared.togglePlay(); });
    expect(shared.isPlaying).toBe(false);
    expect(sent("command")).toEqual([]);
    expect(sent("report").at(-1).playback.isPlaying).toBe(false);
  });

  it("never replays old room snapshots over an automatic transition or a local seek", async () => {
    await acquire();
    await act(async () => { setLocal({ currentIndex: 1, currentFile: queue[1], progress: 24, isPlaying: true }); });
    await message(room({ revision: 10, playback: playback({ isPlaying: false, progress: 5 }) }));
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(shared.currentFile?.id).toBe("second");
    expect(shared.isPlaying).toBe(true);
    await act(async () => { shared.seek(62); });
    await message(room({ revision: 11, playback: playback({ progress: 5 }) }));
    expect(shared.progress).toBe(62);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("executes a targeted command once and reports the committed result with its acknowledgement", async () => {
    await acquire();
    socketMock.socket.send.mockClear();
    const command = { type: "player-command", protocol: 2, outputId: "local", outputGeneration: 1, revision: 1, command: { type: "seek", seconds: 77 } };
    await message(command);
    await message(command);
    expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "seek", seconds: 77 });
    const reports = sent("report").filter(m => m.commandRevision === 1);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every(m => m.playback.progress === 77)).toBe(true);
  });

  it("orders rapid remote commands against the updated player and ignores old generations", async () => {
    await acquire();
    await act(async () => {
      for (const revision of [1, 2]) socketMock.options!.onMessage({ data: JSON.stringify({
        type: "player-command", protocol: 2, outputId: "local", outputGeneration: 1, revision, command: { type: "next" },
      }) });
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(shared.currentFile?.id).toBe("third");
    await message({ type: "player-command", protocol: 2, outputId: "local", outputGeneration: 0, revision: 100, command: { type: "playing", value: false } });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(shared.isPlaying).toBe(true);
  });

  it("sends remote controls without touching the silent local player", async () => {
    await message({ type: "welcome", deviceId: "local" });
    await message(room({ outputId: "remote" }));
    socketMock.socket.send.mockClear();
    await act(async () => { shared.seek(90); });
    expect(execute).not.toHaveBeenCalled();
    expect(sent("command")).toEqual([{ type: "command", command: { type: "seek", seconds: 90 } }]);
  });

  it("keeps main playback running on socket close and after reconnect, until explicit output selection", async () => {
    await acquire();
    mute.mockClear(); leaseMode.mockClear();
    await act(async () => { socketMock.options!.onClose(); });
    expect(mute).not.toHaveBeenCalledWith(true, expect.anything());
    expect(leaseMode).toHaveBeenLastCalledWith(false);
    expect(shared.isPlaying).toBe(true);
    expect(sync.localPlayback).toBe(true);
    await message({ type: "welcome", deviceId: "local" });
    expect(sent("detach").at(-1)).toEqual({ type: "detach" });
    await message(room({ outputId: null, playback: playback({ isPlaying: false }) }));
    expect(shared.isPlaying).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(1);
    await message(room({ outputId: null, pendingOutputId: "remote" }));
    expect(shared.isPlaying).toBe(true);
    await act(async () => { shared.seek(66); });
    expect(local.progress).toBe(66);
    expect(sent("command")).toEqual([]);
  });

  it("still silences the old device before acknowledging an explicit handoff", async () => {
    await acquire();
    mute.mockClear(); socketMock.socket.send.mockClear();
    await message(room({ revision: 2, outputId: null, pendingOutputId: "remote" }));
    expect(mute).toHaveBeenCalledWith(true, "Output changed or session ended");
    expect(local.isPlaying).toBe(false);
    expect(sent("released")).toEqual([{ type: "released", revision: 2 }]);
  });
  it("ends an expired Party lease without pausing or scheduling a cutoff of main playback", async () => {
    await acquire(room(), 100);
    mute.mockClear();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 130)); });
    expect(socketMock.socket.close).toHaveBeenCalledWith(4000, "Party output lease ended");
    expect(leaseMode.mock.calls.every(([required]) => required === false)).toBe(true);
    expect(mute.mock.calls.every(([muted]) => muted === false)).toBe(true);
    expect(shared.isPlaying).toBe(true);
    expect(sync.localPlayback).toBe(true);
  });
  it("adopts standalone playback on explicit rejoin without seeking back to the old Party snapshot", async () => {
    await acquire();
    await act(async () => { socketMock.options!.onError(); });
    await act(async () => { shared.seek(81); });
    await message({ type: "welcome", deviceId: "local" });
    await message(room({ outputId: null, playback: playback({ progress: 3, isPlaying: false }) }));
    await act(async () => { sync.selectOutput("local"); });
    await message(room({ outputGeneration: 2, playback: playback({ progress: 3, isPlaying: false }) }));
    await message({ type: "lease", granted: true, sent: performance.now(), leaseMs: 90000 });
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(shared.progress).toBe(81);
    expect(shared.isPlaying).toBe(true);
    expect(sent("report").at(-1)).toMatchObject({ outputGeneration: 2, commandRevision: 0, playback: { progress: 81, isPlaying: true } });
  });
});

// @vitest-environment happy-dom

import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerProvider, usePlayer, type PlayerContextValue } from "./PlayerContext";
import type { PartyPlayback } from "@/lib/party";
import { AUTO_TRANSITION } from "@/lib/transition";
import { createDefaultModel } from "@/lib/model";
import type { CachedTrack, DriveFile } from "@/types";

const database = vi.hoisted(() => ({
  getCachedTrack: vi.fn(),
  listCachedTracks: vi.fn(),
  loadModel: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null }),
  getSession: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/components/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/drive", () => ({ downloadFileFresh: vi.fn() }));
vi.mock("@/lib/metadata", () => ({ parseTrackMetadata: vi.fn() }));
vi.mock("@/lib/analysisClient", () => ({ analyzeTrack: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/db", () => ({
  ...database,
  listRecentSources: vi.fn().mockResolvedValue([]),
  loadPlaybackSession: vi.fn().mockResolvedValue(null),
  savePlaybackSession: vi.fn().mockResolvedValue(undefined),
  saveModel: vi.fn().mockResolvedValue(undefined),
  recordModelEvent: vi.fn().mockResolvedValue(undefined),
  recordRecentSource: vi.fn().mockResolvedValue(undefined),
  deleteCachedTrack: vi.fn().mockResolvedValue(undefined),
  putCachedTrack: vi.fn().mockResolvedValue(undefined),
  updateTrackLoudnessGain: vi.fn().mockResolvedValue(undefined),
  getTrackAnalysis: vi.fn().mockResolvedValue(null),
  putTrackAnalysis: vi.fn().mockResolvedValue(undefined),
  listTrackAnalyses: vi.fn().mockResolvedValue(new Map()),
  listTransitionSettings: vi.fn().mockResolvedValue(new Map()),
  putTransitionSettings: vi.fn().mockResolvedValue(undefined),
  transitionKey: (from: string, to: string) => `${from}:${to}`,
}));

class FakeParam {
  value = 1;
  cancelScheduledValues() { return this; }
  setValueAtTime(value: number) { this.value = value; return this; }
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  frequencyBinCount = 128;
  connect(node: FakeNode) { return node; }
  getByteFrequencyData(data: Uint8Array) { data.fill(0); }
}

class FakeAudioContext extends EventTarget {
  state = "running";
  currentTime = 0;
  sampleRate = 100;
  destination = new FakeNode();
  createGain() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createConvolver() { return new FakeNode(); }
  createDynamicsCompressor() { return new FakeNode(); }
  createAnalyser() { return new FakeNode(); }
  createMediaElementSource() { return new FakeNode(); }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  async resume() { this.state = "running"; }
}

interface MediaState {
  paused: boolean;
  ended: boolean;
  currentTime: number;
}

const files: DriveFile[] = ["first", "second", "third"].map(id => ({
  id, name: `${id}.mp3`, mimeType: "audio/mpeg",
}));

let tracks: Map<string, CachedTrack>;
let media: WeakMap<HTMLMediaElement, MediaState>;
let player: PlayerContextValue;
let root: Root;
let container: HTMLDivElement;
let clock = 0;
let seeks: number[];
let renders: Array<{ fileId: string | undefined; loading: boolean }>;

function state(element: HTMLMediaElement): MediaState {
  let value = media.get(element);
  if (!value) {
    value = { paused: true, ended: false, currentTime: 0 };
    media.set(element, value);
  }
  return value;
}

function Probe() {
  const value = usePlayer();
  useLayoutEffect(() => {
    player = value;
    renders.push({ fileId: value.currentFile?.id, loading: value.isLoading });
  });
  return null;
}

function slots() {
  return Array.from(container.querySelectorAll("audio"));
}

function sharedPlayback(overrides: Partial<PartyPlayback> = {}): PartyPlayback {
  return {
    queue: files, currentIndex: 0, source: null, progress: 21, duration: 100,
    isPlaying: false, shuffle: false, shuffleOrder: [], playNextIndex: null,
    loopMode: "off", meta: null, updatedAt: Date.now(), ...overrides,
  };
}

async function mount() {
  await act(async () => {
    root.render(createElement(PlayerProvider, null, createElement(Probe)));
  });
  await act(async () => { player.play(files, 0); });
  expect(player.isPlaying).toBe(true);
  expect(player.currentFile?.id).toBe("first");
}

async function timeupdate(element: HTMLAudioElement, seconds: number) {
  await act(async () => {
    element.currentTime = seconds;
    element.dispatchEvent(new Event("timeupdate"));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "");
  // Audio timeupdate, rather than wall-clock timers, advances transitions in these tests.
  vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  localStorage.clear();
  media = new WeakMap();
  seeks = [];
  renders = [];
  tracks = new Map(files.map(file => [file.id, {
    fileId: file.id, blob: new Blob([file.id]), mimeType: file.mimeType,
    driveMeta: file, parsedMeta: { title: file.id, durationSec: 100 },
    cachedAt: 0, loudnessGain: 1,
  }]));
  database.getCachedTrack.mockReset().mockImplementation(async (id: string) => tracks.get(id));
  database.listCachedTracks.mockReset().mockImplementation(async () => Array.from(tracks.values()));
  database.loadModel.mockReset().mockResolvedValue(createDefaultModel());
  let url = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${++url}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (this: HTMLMediaElement) { return state(this).paused; });
  vi.spyOn(HTMLMediaElement.prototype, "ended", "get").mockImplementation(function (this: HTMLMediaElement) { return state(this).ended; });
  vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(100);
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(function (this: HTMLMediaElement) { return state(this).currentTime; });
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "set").mockImplementation(function (this: HTMLMediaElement, value) {
    seeks.push(value);
    state(this).currentTime = value;
    state(this).ended = false;
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (this: HTMLMediaElement) {
    state(this).paused = false;
    state(this).ended = false;
    this.dispatchEvent(new Event("play"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    const wasPlaying = !state(this).paused;
    state(this).paused = true;
    if (wasPlaying) queueMicrotask(() => this.dispatchEvent(new Event("pause")));
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    this.pause();
    state(this).ended = false;
    state(this).currentTime = 0;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("playback across media events", () => {
  it("seeks the native player directly while a Party controller is installed", async () => {
    await mount();
    const partyCommand = vi.fn();
    await act(async () => { player.setPartyCommandHandler(partyCommand); });
    const [active] = slots();
    const source = active.src;
    seeks.length = 0;
    await act(async () => { player.seek(47); });
    expect(partyCommand).not.toHaveBeenCalled();
    expect(seeks).toEqual([47]);
    expect(active.currentTime).toBe(47);
    expect(active.src).toBe(source);
    expect(active.paused).toBe(false);
    expect(player.progress).toBe(47);
  });

  it("advances a natural end locally while a Party controller is installed", async () => {
    await mount();
    const partyCommand = vi.fn();
    await act(async () => {
      player.setPartyCommandHandler(partyCommand);
      player.setGaplessEnabled(false);
    });
    const [outgoing] = slots();
    await act(async () => {
      Object.assign(state(outgoing), { paused: true, ended: true, currentTime: 100 });
      outgoing.dispatchEvent(new Event("pause"));
      outgoing.dispatchEvent(new Event("ended"));
    });
    expect(partyCommand).not.toHaveBeenCalled();
    expect(player.currentFile?.id).toBe("second");
    expect(player.isPlaying).toBe(true);
  });

  it("blocks a new track's report before its load effect replaces the outgoing audio", async () => {
    await mount();
    renders.length = 0;
    await act(async () => { player.play(files, 1); });
    expect(renders.find(render => render.fileId === "second")?.loading).toBe(true);
    expect(player.isLoading).toBe(false);
    expect(player.isPlaying).toBe(true);
  });
  it("does not publish a pause between a natural end and the next song", async () => {
    await mount();
    await act(async () => { player.setGaplessEnabled(false); });
    const [outgoing] = slots();
    await act(async () => {
      Object.assign(state(outgoing), { paused: true, ended: true, currentTime: 100 });
      outgoing.dispatchEvent(new Event("pause"));
    });
    // React may commit between these native tasks. Party Play must never see a pause here.
    expect(player.isPlaying).toBe(true);
    await act(async () => { outgoing.dispatchEvent(new Event("ended")); });
    expect(player.currentFile?.id).toBe("second");
    expect(player.isPlaying).toBe(true);
  });

  it("stops at the end of the queue even though the preceding pause event is ignored", async () => {
    await mount();
    await act(async () => { player.play(files, 2); });
    const [outgoing] = slots();
    await act(async () => {
      Object.assign(state(outgoing), { paused: true, ended: true, currentTime: 100 });
      outgoing.dispatchEvent(new Event("pause"));
      outgoing.dispatchEvent(new Event("ended"));
    });
    expect(player.currentFile?.id).toBe("third");
    expect(player.isPlaying).toBe(false);
  });

  it("ignores a late ended event from the old slot after a gapless promotion", async () => {
    await mount();
    const [outgoing, incoming] = slots();
    await timeupdate(outgoing, 95);
    expect(incoming.getAttribute("src")).toBeTruthy();
    await act(async () => {
      Object.assign(state(outgoing), { paused: true, ended: true, currentTime: 100 });
      outgoing.dispatchEvent(new Event("pause"));
      outgoing.dispatchEvent(new Event("ended"));
    });
    expect(player.currentFile?.id).toBe("second");
    expect(incoming.paused).toBe(false);
    const source = incoming.src;
    await act(async () => { outgoing.dispatchEvent(new Event("ended")); });
    expect(player.currentFile?.id).toBe("second");
    expect(incoming.src).toBe(source);
    expect(incoming.paused).toBe(false);
    expect(player.isPlaying).toBe(true);
  });

  it("keeps the incoming source playing when timeupdate completes a crossfade", async () => {
    await mount();
    await act(async () => { player.setCrossfadeEnabled(true); });
    const [outgoing, incoming] = slots();
    await timeupdate(outgoing, 80);
    expect(incoming.getAttribute("src")).toBeTruthy();
    await timeupdate(outgoing, 96);
    expect(incoming.paused).toBe(false);
    const source = incoming.src;
    incoming.currentTime = 3.9;
    clock += 5000;
    await timeupdate(outgoing, 99.9);
    expect(player.currentFile?.id).toBe("second");
    expect(incoming.src).toBe(source);
    expect(incoming.currentTime).toBe(3.9);
    expect(incoming.paused).toBe(false);
    expect(player.isPlaying).toBe(true);
  });

  it("seeks and pauses the incoming slot after crossfade completion before React commits", async () => {
    await mount();
    await act(async () => { player.setCrossfadeEnabled(true); });
    const [outgoing, incoming] = slots();
    await timeupdate(outgoing, 80);
    await timeupdate(outgoing, 96);
    const source = incoming.src;
    incoming.currentTime = 3.9;
    clock += 5000;
    await act(async () => {
      outgoing.currentTime = 99.9;
      outgoing.dispatchEvent(new Event("timeupdate"));
      // These callbacks still close over the previous render. The transport's
      // active-slot ownership must already belong to the incoming song.
      player.seek(42);
      player.executePartyCommand({ type: "playing", value: false });
      expect(incoming.currentTime).toBe(42);
      expect(incoming.paused).toBe(true);
    });
    expect(player.currentFile?.id).toBe("second");
    expect(incoming.src).toBe(source);
    expect(incoming.currentTime).toBe(42);
    expect(incoming.paused).toBe(true);
    expect(player.isPlaying).toBe(false);
    expect(player.progress).toBe(42);
    expect(outgoing.getAttribute("src")).toBeNull();
  });

  it("retains a new-track seek and pause while waiting for metadata", async () => {
    await mount();
    const ready = vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(0);
    const [active] = slots();
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    await act(async () => { player.play(files, 1); });
    expect(player.currentFile?.id).toBe("second");
    expect(player.isLoading).toBe(true);
    await act(async () => {
      player.seek(63);
      player.executePartyCommand({ type: "playing", value: false });
      // An old clock tick must not replace the requested position while the
      // decoder has yet to accept the new seek.
      active.dispatchEvent(new Event("timeupdate"));
    });
    expect(player.progress).toBe(63);
    ready.mockReturnValue(4);
    await act(async () => { active.dispatchEvent(new Event("loadedmetadata")); });
    expect(active.currentTime).toBe(63);
    expect(active.paused).toBe(true);
    expect(player.isPlaying).toBe(false);
    expect(player.isLoading).toBe(false);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("applies a seek to the requested new track after its download finishes", async () => {
    await mount();
    const [active] = slots();
    const outgoingSource = active.src;
    let finishDownload!: () => void;
    database.getCachedTrack.mockImplementationOnce(() => new Promise<CachedTrack>(resolve => {
      finishDownload = () => resolve(tracks.get("second")!);
    }));
    await act(async () => { player.play(files, 1); });
    expect(player.isLoading).toBe(true);
    await act(async () => {
      player.seek(64);
      player.executePartyCommand({ type: "playing", value: false });
    });
    // The old source is still present, but the seek belongs to the requested
    // track and must not rewind or scrub the preceding song.
    expect(active.src).toBe(outgoingSource);
    expect(active.currentTime).toBe(0);
    expect(player.progress).toBe(64);
    await act(async () => { finishDownload(); });
    expect(active.src).not.toBe(outgoingSource);
    expect(active.currentTime).toBe(64);
    expect(active.paused).toBe(true);
    expect(player.isPlaying).toBe(false);
    expect(player.isLoading).toBe(false);
  });

  it("keeps a newer seek and pause when an earlier new-track play promise settles", async () => {
    await mount();
    const [active] = slots();
    let finishPlay!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      state(this).paused = false;
      state(this).ended = false;
      this.dispatchEvent(new Event("play"));
      return new Promise<void>(resolve => {
        finishPlay = () => {
          // A late decoder completion cannot restore its old playing intent.
          state(active).paused = false;
          resolve();
        };
      });
    });
    await act(async () => { player.play(files, 1); });
    expect(player.isLoading).toBe(true);
    await act(async () => {
      player.seek(71);
      player.executePartyCommand({ type: "playing", value: false });
    });
    await act(async () => { finishPlay(); });
    expect(player.currentFile?.id).toBe("second");
    expect(active.currentTime).toBe(71);
    expect(active.paused).toBe(true);
    expect(player.isPlaying).toBe(false);
    expect(player.isLoading).toBe(false);
    expect(player.error).toBeNull();
  });

  it("holds the displayed transport still during preview and restores the original song", async () => {
    await mount();
    const [active] = slots();
    await timeupdate(active, 23);
    const source = active.src;
    await act(async () => { await player.previewTransition(files[1], files[2], AUTO_TRANSITION); });
    expect(player.isPreviewingTransition).toBe(true);
    expect(player.isPlaying).toBe(false);
    expect(player.progress).toBe(23);
    await timeupdate(active, 96);
    expect(player.progress).toBe(23);
    await act(async () => { player.stopTransitionPreview(); });
    expect(player.isPreviewingTransition).toBe(false);
    expect(player.currentFile?.id).toBe("first");
    expect(player.progress).toBe(23);
    expect(active.src).toBe(source);
    expect(active.currentTime).toBe(23);
    expect(active.paused).toBe(false);
    expect(player.isPlaying).toBe(true);
  });

  it("pauses and resumes at the local position, while applying an explicit shared seek once", async () => {
    await mount();
    const [active] = slots();
    await timeupdate(active, 23);
    const source = active.src;
    const playback = sharedPlayback();
    seeks.length = 0;
    await act(async () => { player.applyPartyPlayback(playback, 1, false, true); });
    expect(active.paused).toBe(true);
    expect(active.currentTime).toBe(23);
    expect(seeks).toEqual([]);
    await act(async () => {
      player.applyPartyPlayback({ ...playback, isPlaying: true, updatedAt: Date.now() }, 2, false, true);
    });
    expect(active.paused).toBe(false);
    expect(active.currentTime).toBe(23);
    expect(active.src).toBe(source);
    expect(seeks).toEqual([]);
    await act(async () => {
      player.applyPartyPlayback({ ...playback, progress: 68, isPlaying: true, updatedAt: Date.now() }, 3);
    });
    expect(seeks).toHaveLength(1);
    expect(seeks[0]).toBeCloseTo(68, 1);
    expect(active.src).toBe(source);
    expect(active.paused).toBe(false);
  });
  it("does not let preview restoration overwrite a newer seek and pause command", async () => {
    await mount();
    const [active] = slots();
    await timeupdate(active, 23);
    await act(async () => { await player.previewTransition(files[1], files[2], AUTO_TRANSITION); });
    await act(async () => {
      player.executePartyCommand({ type: "seek", seconds: 70 });
      player.executePartyCommand({ type: "playing", value: false });
    });
    expect(player.isPreviewingTransition).toBe(false);
    expect(active.currentTime).toBe(70);
    expect(player.progress).toBe(70);
    expect(active.paused).toBe(true);
    expect(player.isPlaying).toBe(false);
  });

  it("ignores an aborted resume after a newer shared pause has already taken effect", async () => {
    await mount();
    await act(async () => { player.togglePlay(); });
    let rejectPlay!: (error: DOMException) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>((_, reject) => {
      rejectPlay = reject;
    }));
    await act(async () => {
      player.applyPartyPlayback(sharedPlayback({ isPlaying: true }), 1, false, true);
    });
    await act(async () => {
      player.applyPartyPlayback(sharedPlayback(), 2, false, true);
    });
    await act(async () => {
      rejectPlay(new DOMException("Play interrupted by pause", "AbortError"));
    });
    expect(player.syncRevision).toBe(2);
    expect(player.isPlaying).toBe(false);
    expect(player.error).toBeNull();
  });

  it("acknowledges a queue edit that arrives while a shared resume is pending", async () => {
    await mount();
    await act(async () => { player.togglePlay(); });
    const [active] = slots();
    let finishPlay!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(() => new Promise<void>(resolve => {
      finishPlay = () => {
        state(active).paused = false;
        active.dispatchEvent(new Event("play"));
        resolve();
      };
    }));
    const playback = sharedPlayback({ isPlaying: true });
    await act(async () => { player.applyPartyPlayback(playback, 1, false, true); });
    const updatedQueue = [files[0], files[2], files[1]];
    await act(async () => {
      player.applyPartyPlayback({ ...playback, queue: updatedQueue }, 2, true);
    });
    await act(async () => { finishPlay(); });
    expect(player.syncRevision).toBe(2);
    expect(player.queue).toEqual(updatedQueue);
    expect(player.isPlaying).toBe(true);
    expect(player.error).toBeNull();
  });

  it("leaves a failed load available to retry instead of displaying loading forever", async () => {
    await mount();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    database.getCachedTrack.mockRejectedValueOnce(new Error("Download failed"));
    await act(async () => { player.play(files, 1); });
    expect(player.currentFile?.id).toBe("second");
    expect(player.error).toBe("Download failed");
    expect(player.isLoading).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});

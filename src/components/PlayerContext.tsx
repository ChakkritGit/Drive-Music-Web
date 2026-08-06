"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ToastContext";
import type {
  CachedTrack,
  DriveFile,
  ListeningModel,
  ParsedMetadata,
  PlaybackSession,
  PlaySource,
  RecentSource,
} from "@/types";
import { downloadFile } from "@/lib/drive";
import { parseTrackMetadata } from "@/lib/metadata";
import { extractFeatures } from "@/lib/features";
import { createDefaultModel, predict, trainStep, weightedRandomIndex } from "@/lib/model";
import { analyzeLoudnessGain } from "@/lib/loudness";
import {
  clampSpatialIntensity,
  createSpatialImpulseResponse,
  spatialGainsForIntensity,
} from "@/lib/spatialAudio";
import {
  deleteCachedTrack,
  getCachedTrack,
  listCachedTracks,
  listRecentSources,
  loadModel,
  loadPlaybackSession,
  putCachedTrack,
  recordModelEvent,
  recordRecentSource,
  saveModel,
  savePlaybackSession,
  updateTrackLoudnessGain,
} from "@/lib/db";

const SESSION_SAVE_THROTTLE_MS = 5000;
const GAPLESS_ENABLED_KEY = "drive-music-gapless-enabled";
const CROSSFADE_ENABLED_KEY = "drive-music-crossfade-enabled";
const CROSSFADE_SECONDS_KEY = "drive-music-crossfade-seconds";
export const MAX_CROSSFADE_SECONDS = 12;
// How early the next track gets decoded into the idle element for a gapless join. Long enough
// that even a slow decode of a large file is finished in time, short enough that the queue is
// unlikely to be edited out from under it in the meantime (and if it is, cancelCrossfade
// disarms it).
const GAPLESS_ARM_SECONDS = 8;
const DEFAULT_CROSSFADE_SECONDS = 5;
const VOLUME_NORMALIZATION_ENABLED_KEY = "drive-music-volume-normalization-enabled";
const EQ_ENABLED_KEY = "drive-music-eq-enabled";
const EQ_BASS_KEY = "drive-music-eq-bass";
const EQ_MID_KEY = "drive-music-eq-mid";
const EQ_TREBLE_KEY = "drive-music-eq-treble";
export const MAX_EQ_GAIN_DB = 12;
const VISUALIZER_ENABLED_KEY = "drive-music-visualizer-enabled";
const SPATIAL_AUDIO_ENABLED_KEY = "drive-music-spatial-audio-enabled";
const SPATIAL_AUDIO_INTENSITY_KEY = "drive-music-spatial-audio-intensity";
const DEFAULT_SPATIAL_AUDIO_INTENSITY = 50;

export type LoopMode = "off" | "all" | "one";
type AudioSlot = "A" | "B";

interface DownloadProgress {
  done: number;
  total: number;
}

interface PlayerContextValue {
  queue: DriveFile[];
  currentFile: DriveFile | null;
  currentMeta: ParsedMetadata | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  progress: number;
  duration: number;
  volume: number;
  cachedTracks: Map<string, CachedTrack>;
  downloadProgress: DownloadProgress | null;
  shuffle: boolean;
  loopMode: LoopMode;
  isExpanded: boolean;
  recentSources: RecentSource[];
  model: ListeningModel;
  /** Current shuffled play order (indices into `queue`) when shuffle is on; empty when shuffle is off. */
  shuffleOrder: number[];
  /** What the current queue was played from (a folder/playlist/library), if known — restored across refreshes. */
  currentSource: PlaySource | null;
  /** A queue index guaranteed to play next (set by `addToQueue`), overriding shuffle/sequential order for one step. */
  playNextIndex: number | null;
  /** The upcoming tracks after the current one, in actual play order (respects shuffle/playNextIndex). */
  upNext: { file: DriveFile; index: number }[];
  /** Whether the next track is pre-buffered and started the instant this one ends, with no
   * decode/fetch gap in between. */
  gaplessEnabled: boolean;
  setGaplessEnabled: (value: boolean) => void;
  /** Whether the automatic transition into the next track should crossfade instead of cutting. */
  crossfadeEnabled: boolean;
  /** Crossfade length in seconds, clamped to [0, MAX_CROSSFADE_SECONDS]. */
  crossfadeSeconds: number;
  setCrossfadeEnabled: (value: boolean) => void;
  setCrossfadeSeconds: (value: number) => void;
  /** Whether playback volume is adjusted per-track (via a Web Audio GainNode, so quiet tracks
   * can be boosted, not just loud ones attenuated) to even out loudness — see
   * src/lib/loudness.ts. */
  volumeNormalizationEnabled: boolean;
  setVolumeNormalizationEnabled: (value: boolean) => void;
  /** 3-band equalizer (bass/mid/treble), each in dB within [-MAX_EQ_GAIN_DB, MAX_EQ_GAIN_DB].
   * When `eqEnabled` is false every band is forced flat (0dB) regardless of the stored values. */
  eqEnabled: boolean;
  eqBass: number;
  eqMid: number;
  eqTreble: number;
  setEqEnabled: (value: boolean) => void;
  setEqBass: (value: number) => void;
  setEqMid: (value: number) => void;
  setEqTreble: (value: number) => void;
  /** Whether FullPlayer's ambient glow reacts to the actual audio (via getAudioLevel) instead
   * of animating on a fixed timer. */
  visualizerEnabled: boolean;
  setVisualizerEnabled: (value: boolean) => void;
  /** A convolver-based stereo-widening effect (the closest a finished stereo mix can get to
   * Apple/Spotify-style "spatial audio" — see src/lib/spatialAudio.ts for why a true 3D
   * PannerNode graph doesn't apply here). `spatialAudioIntensity` is a 0-100 percentage. */
  spatialAudioEnabled: boolean;
  spatialAudioIntensity: number;
  setSpatialAudioEnabled: (value: boolean) => void;
  setSpatialAudioIntensity: (value: number) => void;
  /** A live 0..1 "how loud right now" reading from the shared analyser — not React state (see
   * its own definition for why), safe to call every animation frame. */
  getAudioLevel: () => number;
  play: (queue: DriveFile[], index: number, source?: PlaySource) => void;
  addToQueue: (file: DriveFile) => void;
  removeFromQueue: (index: number) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  changeVolume: (value: number) => void;
  removeFromCache: (fileId: string) => Promise<void>;
  downloadAll: (files: DriveFile[]) => Promise<void>;
  /** Progress of an in-progress analyzeAllLoudness() run — null when none is running. */
  analyzeProgress: DownloadProgress | null;
  /** Runs loudness analysis over every downloaded track that hasn't been analyzed yet. */
  analyzeAllLoudness: () => Promise<void>;
  toggleShuffle: () => void;
  cycleLoopMode: () => void;
  expand: () => void;
  collapse: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}

function clampEqGain(db: number): number {
  return Math.min(MAX_EQ_GAIN_DB, Math.max(-MAX_EQ_GAIN_DB, db));
}

/**
 * Calls `audio.play()`, swallowing the browser's autoplay-policy rejection instead of letting
 * it surface as a scary raw error — this fires routinely when play() happens (e.g. after an
 * await for a slow download) too long after the user gesture that triggered it for the
 * browser's "transient activation" window to still be considered active. The track is left
 * loaded and paused; the user can just press play.
 *
 * Also resumes `ctx` (the shared Web Audio graph — see ensureAudioGraph) if it's suspended.
 * Every call site here is gesture-adjacent (a click handler, or a load triggered by one), so
 * this is where the browser's separate "AudioContext needs a user gesture too" gate gets
 * satisfied, same spirit as the NotAllowedError handling below.
 */
async function tryPlay(audio: HTMLAudioElement, ctx: AudioContext | null): Promise<void> {
  try {
    if (ctx && ctx.state === "suspended") await ctx.resume();
    await audio.play();
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") return;
    throw err;
  }
}

/** Returns the cached track for a file, downloading + parsing + storing it first if needed. */
async function ensureCached(
  file: DriveFile,
  accessToken: string | undefined,
): Promise<CachedTrack> {
  const cached = await getCachedTrack(file.id);
  if (cached) return cached;

  if (!accessToken) throw new Error("Not signed in");
  const blob = await downloadFile(accessToken, file);
  const parsedMeta = await parseTrackMetadata(blob, file);
  const track: CachedTrack = {
    fileId: file.id,
    blob,
    mimeType: file.mimeType,
    driveMeta: file,
    parsedMeta,
    cachedAt: Date.now(),
  };
  await putCachedTrack(track);
  return track;
}

/**
 * Weighted shuffle of every index except `pinned`, returned as [pinned, ...weightedRest].
 * Still a full permutation (every index appears once), but higher-weight items tend to
 * sort earlier — Efraimidis-Spirakis weighted sampling: key = random() ** (1/weight).
 * Equal weights (e.g. an untrained model) degrade to a plain uniform shuffle.
 */
export function weightedShuffledIndices(
  length: number,
  pinned: number,
  weights: number[],
): number[] {
  const rest: { index: number; key: number }[] = [];
  for (let i = 0; i < length; i++) {
    if (i === pinned) continue;
    const weight = Math.max(weights[i] ?? 0.5, 0.001);
    rest.push({ index: i, key: Math.random() ** (1 / weight) });
  }
  rest.sort((a, b) => b.key - a.key);
  return [pinned, ...rest.map((r) => r.index)];
}

// Live playback shuffle keeps only a rolling window of upcoming tracks queued (see
// seedShuffleWindow/growShuffleWindow below) instead of shuffling an entire library/playlist
// up front — for a large library that also means computing weights for a handful of
// candidates at a time rather than the whole thing on every advance.
export const SHUFFLE_WINDOW = 20;

function pickWeightedFrom(candidates: number[], weights: number[]): number {
  const candidateWeights = candidates.map((i) => Math.max(weights[i] ?? 0.5, 0.001));
  return candidates[weightedRandomIndex(candidateWeights)];
}

/** Builds the initial shuffle window: [pinned, up to SHUFFLE_WINDOW - 1 more weighted-random
 * picks], instead of a full permutation of the whole queue. */
export function seedShuffleWindow(queueLength: number, pinned: number, weights: number[]): number[] {
  const order = [pinned];
  const used = new Set([pinned]);
  const windowSize = Math.min(queueLength, SHUFFLE_WINDOW);
  while (order.length < windowSize) {
    const candidates: number[] = [];
    for (let i = 0; i < queueLength; i++) if (!used.has(i)) candidates.push(i);
    const pick = pickWeightedFrom(candidates, weights);
    order.push(pick);
    used.add(pick);
  }
  return order;
}

/** Appends exactly one more weighted-random pick to `order`, excluding whatever's already in
 * it — called whenever advancing leaves fewer than SHUFFLE_WINDOW tracks queued ahead, so "Up
 * Next" stays topped up instead of the whole library being shuffled once up front. Once every
 * track has appeared in `order`, loop "off" leaves it as-is (nothing left to add — Up Next
 * tapers to empty as the real end of the queue is reached, same as the non-shuffle case);
 * loop "all" starts allowing repeats, only excluding the track being advanced from. */
export function growShuffleWindow(
  order: number[],
  queueLength: number,
  weights: number[],
  loopOff: boolean,
  advancingFrom: number,
): number[] {
  const used = new Set(order);
  let candidates: number[] = [];
  for (let i = 0; i < queueLength; i++) if (!used.has(i)) candidates.push(i);
  if (candidates.length === 0) {
    if (loopOff) return order;
    candidates = [];
    for (let i = 0; i < queueLength; i++) if (i !== advancingFrom) candidates.push(i);
    if (candidates.length === 0) return order; // only one track total — nothing to add
  }
  return [...order, pickWeightedFrom(candidates, weights)];
}

/** Rewrites a shuffle window after the queue entry at `removedIndex` is deleted: drops that
 * entry and shifts every later index down by one. Editing the queue must never change what
 * plays next — clearing the order instead (what this used to do) makes the effect below reseed
 * a brand-new random window, so deleting one track from "Up Next" visibly re-randomizes all the
 * others. */
export function remapShuffleOrderAfterRemoval(
  order: number[],
  removedIndex: number,
): number[] {
  return order
    .filter((i) => i !== removedIndex)
    .map((i) => (i > removedIndex ? i - 1 : i));
}

/** Rewrites a shuffle window after `addToQueue` moves/inserts a track: the entry that was at
 * `fromIndex` (or nothing, for a brand-new track) ends up at `toIndex`. Everything the window
 * already had keeps its relative order — the moved track is placed right after `pinned` (the
 * currently-playing track), matching where it will actually play. */
export function remapShuffleOrderAfterInsert(
  order: number[],
  fromIndex: number | null,
  toIndex: number,
  pinned: number,
): number[] {
  const withoutMoved =
    fromIndex === null ? order : remapShuffleOrderAfterRemoval(order, fromIndex);
  // Indices in the post-removal queue at or after the insertion point shift up by one.
  const shifted = withoutMoved.map((i) => (i >= toIndex ? i + 1 : i));
  const pinnedPosition = shifted.indexOf(pinned);
  // The window no longer describes where we are (shouldn't happen — the caller only calls this
  // with a non-empty order containing the current track — but reseeding is handled elsewhere).
  if (pinnedPosition === -1) return shifted;
  return [
    ...shifted.slice(0, pinnedPosition + 1),
    toIndex,
    ...shifted.slice(pinnedPosition + 1),
  ];
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  // Two audio elements so a crossfade can play the outgoing and incoming track at once —
  // `activeSlotRef` says which one is "the" player for everything else (progress, seek,
  // volume, ...). It only ever changes inside the load effect's crossfade-commit branch,
  // right before the demoted element is paused, so a stray pause event from the demoted
  // element is never misread as the active track pausing.
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeSlotRef = useRef<AudioSlot>("A");
  const getActiveAudio = useCallback(
    () => (activeSlotRef.current === "A" ? audioARef.current : audioBRef.current),
    [],
  );
  const getInactiveAudio = useCallback(
    () => (activeSlotRef.current === "A" ? audioBRef.current : audioARef.current),
    [],
  );

  // Routes both audio elements through a shared Web Audio graph:
  //   sourceA → gainA ⎫                              ⎧→ spatialDryGain ⎫
  //                    ⎬→ eqBass → eqMid → eqTreble → ⎨                 ⎬→ compressor → analyser → destination
  //   sourceB → gainB ⎭                              ⎩→ spatialConvolver → spatialWetGain ⎭
  // Each element gets its own GainNode (needed so the crossfade ramp can control them
  // independently — see startCrossfade/advanceCrossfadeRamp); everything downstream of that
  // merge point is shared, since EQ/limiting/analysis apply to "whatever's audible right now"
  // regardless of which element that currently is. GainNode is also what lets volume
  // normalization *boost* a quiet track above 1.0 — HTMLMediaElement.volume alone caps at 1.0,
  // so it can only ever turn loud tracks down (see src/lib/loudness.ts).
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const eqBassRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqTrebleRef = useRef<BiquadFilterNode | null>(null);
  // Convolver-based stereo widener (spatial audio) — see spatialGainsForIntensity for how
  // enabled/intensity drive these two gains.
  const spatialConvolverRef = useRef<ConvolverNode | null>(null);
  const spatialDryGainRef = useRef<GainNode | null>(null);
  const spatialWetGainRef = useRef<GainNode | null>(null);
  // A gentle, always-on limiter — not user-facing (no toggle/settings) — so boosting a quiet
  // track for volume normalization can't drive a peak into clipping.
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioGraphInitializedRef = useRef(false);

  // Idempotent and side-effect-free to call again — `createMediaElementSource` can only ever
  // be called once per <audio> element (a second call throws), which is exactly why this
  // isn't a useEffect-with-cleanup: React Strict Mode's dev-only double-invocation of effects
  // would otherwise close the context on the first "cleanup" with no way to rebuild it, since
  // the elements can never be re-attached to a fresh source node.
  const ensureAudioGraph = useCallback(() => {
    if (audioGraphInitializedRef.current) return;
    const audioA = audioARef.current;
    const audioB = audioBRef.current;
    if (!audioA || !audioB) return;
    audioGraphInitializedRef.current = true;

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    audioContextRef.current = ctx;

    const gainA = ctx.createGain();
    ctx.createMediaElementSource(audioA).connect(gainA);
    gainARef.current = gainA;

    const gainB = ctx.createGain();
    ctx.createMediaElementSource(audioB).connect(gainB);
    gainBRef.current = gainB;

    const eqBass = ctx.createBiquadFilter();
    eqBass.type = "lowshelf";
    eqBass.frequency.value = 320;
    eqBassRef.current = eqBass;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = "peaking";
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    eqMidRef.current = eqMid;

    const eqTreble = ctx.createBiquadFilter();
    eqTreble.type = "highshelf";
    eqTreble.frequency.value = 3200;
    eqTrebleRef.current = eqTreble;

    const spatialConvolver = ctx.createConvolver();
    spatialConvolver.buffer = createSpatialImpulseResponse(ctx);
    spatialConvolverRef.current = spatialConvolver;

    const spatialDryGain = ctx.createGain();
    spatialDryGain.gain.value = 1;
    spatialDryGainRef.current = spatialDryGain;

    const spatialWetGain = ctx.createGain();
    spatialWetGain.gain.value = 0;
    spatialWetGainRef.current = spatialWetGain;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;
    compressorRef.current = compressor;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    analyserRef.current = analyser;

    gainA.connect(eqBass);
    gainB.connect(eqBass);
    eqBass.connect(eqMid).connect(eqTreble);
    eqTreble.connect(spatialDryGain);
    eqTreble.connect(spatialConvolver);
    spatialConvolver.connect(spatialWetGain);
    spatialDryGain.connect(compressor);
    spatialWetGain.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(ctx.destination);
  }, []);

  useEffect(() => {
    ensureAudioGraph();
  }, [ensureAudioGraph]);

  const getGainNode = useCallback((audio: HTMLAudioElement | null): GainNode | null => {
    if (!audio) return null;
    if (audio === audioARef.current) return gainARef.current;
    if (audio === audioBRef.current) return gainBRef.current;
    return null;
  }, []);

  // A 0..1 "how loud is the music right now" reading from the shared analyser, weighted
  // toward bass/mid frequencies (where rhythm mostly lives) so it reads as a beat-following
  // pulse rather than flickering on every hi-hat — used by FullPlayer's ambient visualizer.
  // Not React state: this needs to be read every animation frame, far too often to re-render
  // on, so it's a plain function reading live analyser data on demand instead.
  const getAudioLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    const data = analyserDataRef.current;
    if (!analyser || !data) return 0;
    analyser.getByteFrequencyData(data);
    const usableBins = Math.max(1, Math.round(data.length * 0.6));
    let sum = 0;
    for (let i = 0; i < usableBins; i++) sum += data[i];
    return sum / usableBins / 255;
  }, []);

  const objectUrlRef = useRef<string | null>(null);
  // The blob URL currently loaded into the *inactive* element while it fades in — promoted to
  // objectUrlRef (and the old objectUrlRef revoked) once the crossfade commits.
  const fadeObjectUrlRef = useRef<string | null>(null);
  const crossfadeStateRef = useRef<{
    startTime: number;
    durationMs: number;
    targetIndex: number;
    targetFile: DriveFile;
    // Each element ramps toward/from its own gain-adjusted volume — outgoing and incoming
    // tracks can have different normalization gains, so a single shared target wouldn't work.
    outgoingStartVolume: number;
    incomingTargetVolume: number;
    incomingGain: GainNode;
    outgoingGain: GainNode;
  } | null>(null);
  // Set right before setCurrentIndex() at the end of a crossfade, so the load effect can tell
  // "this transition was already faded in on the other element" apart from a normal load.
  const crossfadeCommittedForRef = useRef<string | null>(null);
  // Gapless playback: the next track, already decoded into the *inactive* element and sitting
  // paused at 0:00, waiting for the current one to end. Its blob URL lives in fadeObjectUrlRef
  // (the same slot a crossfade uses — the two never run at once, see handleTimeUpdate), so
  // firing it reuses the crossfade's commit path wholesale.
  const gaplessArmedRef = useRef<{ fileId: string; index: number } | null>(null);

  const previousFileRef = useRef<DriveFile | null>(null);
  const modelInitializedRef = useRef(false);
  const pendingRestoreRef = useRef<{ progress: number } | null>(null);
  const lastSessionSaveRef = useRef(0);
  const progressRef = useRef(0);
  const lastLoadedFileIdRef = useRef<string | null>(null);

  const [queue, setQueue] = useState<DriveFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [currentMeta, setCurrentMeta] = useState<ParsedMetadata | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [cachedTracks, setCachedTracks] = useState<Map<string, CachedTrack>>(
    new Map(),
  );
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [analyzeProgress, setAnalyzeProgress] =
    useState<DownloadProgress | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>("off");
  const [isExpanded, setIsExpanded] = useState(false);
  const [recentSources, setRecentSources] = useState<RecentSource[]>([]);
  const [model, setModel] = useState<ListeningModel>(() =>
    createDefaultModel(),
  );
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [currentSource, setCurrentSource] = useState<PlaySource | null>(null);
  const [playNextIndex, setPlayNextIndex] = useState<number | null>(null);
  const [gaplessEnabled, setGaplessEnabledState] = useState(true);
  const [crossfadeEnabled, setCrossfadeEnabledState] = useState(false);
  const [crossfadeSeconds, setCrossfadeSecondsState] = useState(
    DEFAULT_CROSSFADE_SECONDS,
  );
  const [volumeNormalizationEnabled, setVolumeNormalizationEnabledState] = useState(true);
  const [eqEnabled, setEqEnabledState] = useState(false);
  const [eqBass, setEqBassState] = useState(0);
  const [eqMid, setEqMidState] = useState(0);
  const [eqTreble, setEqTrebleState] = useState(0);
  const [visualizerEnabled, setVisualizerEnabledState] = useState(true);
  const [spatialAudioEnabled, setSpatialAudioEnabledState] = useState(false);
  const [spatialAudioIntensity, setSpatialAudioIntensityState] = useState(
    DEFAULT_SPATIAL_AUDIO_INTENSITY,
  );

  useEffect(() => {
    const storedGapless = localStorage.getItem(GAPLESS_ENABLED_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seed from localStorage on mount
    if (storedGapless !== null) setGaplessEnabledState(storedGapless === "true");
    const storedEnabled = localStorage.getItem(CROSSFADE_ENABLED_KEY);
    if (storedEnabled !== null) setCrossfadeEnabledState(storedEnabled === "true");
    const storedSeconds = Number(localStorage.getItem(CROSSFADE_SECONDS_KEY));
    if (Number.isFinite(storedSeconds) && storedSeconds > 0) {
      setCrossfadeSecondsState(Math.min(MAX_CROSSFADE_SECONDS, storedSeconds));
    }
    const storedNormalization = localStorage.getItem(VOLUME_NORMALIZATION_ENABLED_KEY);
    if (storedNormalization !== null) {
      setVolumeNormalizationEnabledState(storedNormalization === "true");
    }
    const storedEqEnabled = localStorage.getItem(EQ_ENABLED_KEY);
    if (storedEqEnabled !== null) setEqEnabledState(storedEqEnabled === "true");
    const storedBass = Number(localStorage.getItem(EQ_BASS_KEY));
    if (Number.isFinite(storedBass)) setEqBassState(clampEqGain(storedBass));
    const storedMid = Number(localStorage.getItem(EQ_MID_KEY));
    if (Number.isFinite(storedMid)) setEqMidState(clampEqGain(storedMid));
    const storedTreble = Number(localStorage.getItem(EQ_TREBLE_KEY));
    if (Number.isFinite(storedTreble)) setEqTrebleState(clampEqGain(storedTreble));
    const storedVisualizer = localStorage.getItem(VISUALIZER_ENABLED_KEY);
    if (storedVisualizer !== null) setVisualizerEnabledState(storedVisualizer === "true");
    const storedSpatialEnabled = localStorage.getItem(SPATIAL_AUDIO_ENABLED_KEY);
    if (storedSpatialEnabled !== null) {
      setSpatialAudioEnabledState(storedSpatialEnabled === "true");
    }
    const storedSpatialIntensity = Number(localStorage.getItem(SPATIAL_AUDIO_INTENSITY_KEY));
    if (Number.isFinite(storedSpatialIntensity)) {
      setSpatialAudioIntensityState(clampSpatialIntensity(storedSpatialIntensity));
    }
  }, []);

  const setGaplessEnabled = useCallback((value: boolean) => {
    setGaplessEnabledState(value);
    localStorage.setItem(GAPLESS_ENABLED_KEY, String(value));
  }, []);

  const setCrossfadeEnabled = useCallback((value: boolean) => {
    setCrossfadeEnabledState(value);
    localStorage.setItem(CROSSFADE_ENABLED_KEY, String(value));
  }, []);

  const setCrossfadeSeconds = useCallback((value: number) => {
    const clamped = Math.min(MAX_CROSSFADE_SECONDS, Math.max(0, value));
    setCrossfadeSecondsState(clamped);
    localStorage.setItem(CROSSFADE_SECONDS_KEY, String(clamped));
  }, []);

  const setVolumeNormalizationEnabled = useCallback((value: boolean) => {
    setVolumeNormalizationEnabledState(value);
    localStorage.setItem(VOLUME_NORMALIZATION_ENABLED_KEY, String(value));
  }, []);

  const setEqEnabled = useCallback((value: boolean) => {
    setEqEnabledState(value);
    localStorage.setItem(EQ_ENABLED_KEY, String(value));
  }, []);

  const setEqBass = useCallback((value: number) => {
    const clamped = clampEqGain(value);
    setEqBassState(clamped);
    localStorage.setItem(EQ_BASS_KEY, String(clamped));
  }, []);

  const setEqMid = useCallback((value: number) => {
    const clamped = clampEqGain(value);
    setEqMidState(clamped);
    localStorage.setItem(EQ_MID_KEY, String(clamped));
  }, []);

  const setEqTreble = useCallback((value: number) => {
    const clamped = clampEqGain(value);
    setEqTrebleState(clamped);
    localStorage.setItem(EQ_TREBLE_KEY, String(clamped));
  }, []);

  const setVisualizerEnabled = useCallback((value: boolean) => {
    setVisualizerEnabledState(value);
    localStorage.setItem(VISUALIZER_ENABLED_KEY, String(value));
  }, []);

  const setSpatialAudioEnabled = useCallback((value: boolean) => {
    setSpatialAudioEnabledState(value);
    localStorage.setItem(SPATIAL_AUDIO_ENABLED_KEY, String(value));
  }, []);

  const setSpatialAudioIntensity = useCallback((value: number) => {
    const clamped = clampSpatialIntensity(value);
    setSpatialAudioIntensityState(clamped);
    localStorage.setItem(SPATIAL_AUDIO_INTENSITY_KEY, String(clamped));
  }, []);

  // Applies the EQ settings to the actual filter nodes — when off, every band is forced to 0dB
  // (flat) regardless of the stored slider values, rather than disconnecting the nodes.
  useEffect(() => {
    const bass = eqBassRef.current;
    const mid = eqMidRef.current;
    const treble = eqTrebleRef.current;
    if (bass) bass.gain.value = eqEnabled ? eqBass : 0;
    if (mid) mid.gain.value = eqEnabled ? eqMid : 0;
    if (treble) treble.gain.value = eqEnabled ? eqTreble : 0;
  }, [eqEnabled, eqBass, eqMid, eqTreble]);

  // Applies the spatial-audio wet/dry blend — when off, wet is 0 and dry is 1, so the signal
  // passes through unchanged.
  useEffect(() => {
    const dry = spatialDryGainRef.current;
    const wet = spatialWetGainRef.current;
    if (!dry || !wet) return;
    const gains = spatialGainsForIntensity(spatialAudioEnabled, spatialAudioIntensity);
    dry.gain.value = gains.dry;
    wet.gain.value = gains.wet;
  }, [spatialAudioEnabled, spatialAudioIntensity]);

  // Aborts an in-progress crossfade — restores the active element to full volume (abandoning
  // the fade-out) and resets the inactive one, so a manual skip/seek/pause mid-fade cuts
  // cleanly instead of leaving either element stuck at a partial volume.
  const cancelCrossfade = useCallback(() => {
    // A pre-buffered gapless track is invalidated by every one of this function's callers
    // (skip, seek, pause, queue edit): what plays next, or where the current track is, has
    // just changed. Cleared before the early return below, since arming one doesn't create
    // any crossfade state.
    const armed = gaplessArmedRef.current;
    gaplessArmedRef.current = null;
    if (armed) {
      const idle = getInactiveAudio();
      if (idle) {
        idle.pause();
        idle.removeAttribute("src");
        idle.load();
      }
      if (fadeObjectUrlRef.current) {
        URL.revokeObjectURL(fadeObjectUrlRef.current);
        fadeObjectUrlRef.current = null;
      }
    }
    const state = crossfadeStateRef.current;
    if (!state) return;
    crossfadeStateRef.current = null;
    const active = getActiveAudio();
    const activeGain = getGainNode(active);
    if (activeGain) {
      // Inlined (rather than calling the `trackGain`/`currentFile` declared further down) so
      // this can stay defined here, ahead of the many other callbacks that depend on it.
      const activeFile = currentIndex !== null ? queue[currentIndex] : undefined;
      const gain = volumeNormalizationEnabled
        ? (activeFile ? (cachedTracks.get(activeFile.id)?.loudnessGain ?? 1) : 1)
        : 1;
      activeGain.gain.value = volume * gain;
    }
    const inactive = getInactiveAudio();
    if (inactive) {
      inactive.pause();
      inactive.removeAttribute("src");
      inactive.load();
    }
    if (fadeObjectUrlRef.current) {
      URL.revokeObjectURL(fadeObjectUrlRef.current);
      fadeObjectUrlRef.current = null;
    }
  }, [
    getActiveAudio,
    getInactiveAudio,
    getGainNode,
    volume,
    currentIndex,
    queue,
    cachedTracks,
    volumeNormalizationEnabled,
  ]);

  const refreshCachedTracks = useCallback(async () => {
    const tracks = await listCachedTracks();
    setCachedTracks(new Map(tracks.map((t) => [t.fileId, t])));
  }, []);

  const refreshRecentSources = useCallback(async () => {
    setRecentSources(await listRecentSources());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seed cache index from IndexedDB on mount
    refreshCachedTracks();
    refreshRecentSources();
  }, [refreshCachedTracks, refreshRecentSources]);

  useEffect(() => {
    let cancelled = false;
    loadModel().then((loaded) => {
      if (cancelled) return;
      setModel(loaded);
      modelInitializedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persists the model whenever it changes — but not before the initial load above has
  // resolved, or this would immediately overwrite a saved model with fresh zero weights.
  useEffect(() => {
    if (!modelInitializedRef.current) return;
    saveModel(model);
  }, [model]);

  // Restores the last playback session on mount, so a refresh (or navigating away and back)
  // doesn't lose what was playing. Deliberately does not auto-play — browsers block
  // audio.play() without a user gesture anyway, and it also avoids surprising the user with
  // sound immediately on load. The load effect below detects `pendingRestoreRef` and seeks to
  // the saved position instead of starting from 0 / auto-playing.
  useEffect(() => {
    let cancelled = false;
    loadPlaybackSession().then((session: PlaybackSession | null) => {
      if (cancelled || !session || session.queue.length === 0) return;
      pendingRestoreRef.current = { progress: session.progress };
      setQueue(session.queue);
      setCurrentIndex(session.currentIndex);
      setCurrentSource(session.source);
      setShuffle(session.shuffle);
      // Falls back to [] for a session saved before this field existed — same as today's
      // behavior (reseeds fresh on first use), just not yet fixed for that one old session.
      setShuffleOrder(session.shuffleOrder ?? []);
      setLoopMode(session.loopMode);
      setVolumeState(session.volume);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentFile =
    currentIndex !== null ? (queue[currentIndex] ?? null) : null;

  // Effective playback gain for `fileId` — 1 (unchanged) when normalization is off or the
  // track hasn't been analyzed yet.
  const trackGain = useCallback(
    (fileId: string) =>
      volumeNormalizationEnabled ? (cachedTracks.get(fileId)?.loudnessGain ?? 1) : 1,
    [volumeNormalizationEnabled, cachedTracks],
  );

  // Analyzes a newly-cached track's loudness in the background (once per track — a no-op if
  // already analyzed) and persists the result, so every later play of it is gain-adjusted
  // without re-decoding the file each time. If this happens to be the track currently
  // playing, also reapplies its volume immediately instead of waiting for the next load.
  const ensureLoudnessAnalyzed = useCallback(
    (track: CachedTrack): Promise<void> => {
      if (track.loudnessGain !== undefined) return Promise.resolve();
      return analyzeLoudnessGain(track.blob)
        .then(async (gain) => {
          await updateTrackLoudnessGain(track.fileId, gain);
          await refreshCachedTracks();
          if (currentFile?.id === track.fileId) {
            const gainNode = getGainNode(getActiveAudio());
            if (gainNode) gainNode.gain.value = volume * (volumeNormalizationEnabled ? gain : 1);
          }
        })
        .catch((err) => {
          console.error(`Loudness analysis failed for ${track.fileId}`, err);
        });
    },
    [refreshCachedTracks, currentFile, volume, volumeNormalizationEnabled, getActiveAudio, getGainNode],
  );

  // Loads (from cache, or downloads + caches + parses) and plays whenever the current file changes.
  useEffect(() => {
    if (!currentFile) return;
    if (lastLoadedFileIdRef.current === currentFile.id) {
      // This effect also depends on `session?.accessToken` (so a load that failed because the
      // session wasn't ready yet can retry once it resolves) — but the token resolving/
      // refreshing in the background for a track that's already loaded must NOT re-trigger a
      // reload-and-autoplay of the same track (e.g. right after a restore-on-refresh, before
      // any user gesture).
      return;
    }
    let cancelled = false;

    async function load(file: DriveFile) {
      // The previous track's "turn" just ended (skipped or finished) — train the listening
      // model on how much of it actually got played, reading straight from the DOM's own
      // playback position to avoid any React state-timing races.
      const outgoingAudio = getActiveAudio();
      const previousFile = previousFileRef.current;
      if (outgoingAudio && previousFile) {
        const dur = outgoingAudio.duration;
        const fraction =
          dur && Number.isFinite(dur) && dur > 0
            ? Math.min(1, outgoingAudio.currentTime / dur)
            : 0;
        const features = extractFeatures(
          previousFile,
          currentMeta ?? undefined,
          new Date(),
        );
        const predicted = predict(model, features);
        setModel((prev) => trainStep(prev, features, fraction));
        void recordModelEvent({
          id: crypto.randomUUID(),
          trackId: previousFile.id,
          title: currentMeta?.title || previousFile.name,
          fraction,
          predicted,
          at: Date.now(),
        });
      }
      previousFileRef.current = file;

      // A crossfade already faded this exact track in on the other audio element — promote
      // it instead of reloading (which would restart playback and undo the fade).
      if (crossfadeCommittedForRef.current === file.id) {
        crossfadeCommittedForRef.current = null;
        const demoted = outgoingAudio;
        // Flip first: the demoted element's pause below fires a native `pause` event, and
        // handlePause only reacts to it if it still looks like the active element.
        activeSlotRef.current = activeSlotRef.current === "A" ? "B" : "A";
        if (demoted) {
          demoted.pause();
          demoted.removeAttribute("src");
          demoted.load();
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = fadeObjectUrlRef.current;
        fadeObjectUrlRef.current = null;

        const promoted = getActiveAudio();
        if (promoted?.paused) void tryPlay(promoted, audioContextRef.current);
        if (promoted) {
          // It was already playing as the inactive element, so its `play` event was ignored
          // by handlePlay's active-only guard — nothing else would flip this back on.
          setIsPlaying(!promoted.paused);
          // The promoted element's `loadedmetadata` fired back while it was still the
          // inactive fade-in element, so handleLoadedMetadata's active-only guard dropped it
          // — duration would otherwise be stuck at the outgoing track's length, making the
          // seek bar's max wrong and the thumb stop short of (or overshoot) the real end.
          setDuration(Number.isFinite(promoted.duration) ? promoted.duration : 0);
          progressRef.current = promoted.currentTime;
          setProgress(promoted.currentTime);
        }

        lastLoadedFileIdRef.current = file.id;
        setCurrentMeta(cachedTracks.get(file.id)?.parsedMeta ?? null);
        return;
      }

      setIsLoading(true);
      setError(null);
      setCurrentMeta(null);

      try {
        const track = await ensureCached(file, session?.accessToken);
        await refreshCachedTracks();
        if (cancelled) return;
        // Only mark this file as "loaded" once it has actually succeeded — a failure (e.g. no
        // access token yet) must NOT set this, so a retry once the token resolves still runs.
        lastLoadedFileIdRef.current = file.id;
        // Fire-and-forget: doesn't block playback starting, applies to future loads (and this
        // one live, once it resolves) once analysis finishes.
        void ensureLoudnessAnalyzed(track);

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(track.blob);
        objectUrlRef.current = url;
        setCurrentMeta(track.parsedMeta);

        const restore = pendingRestoreRef.current;
        pendingRestoreRef.current = null;

        const audio = getActiveAudio();
        if (audio) {
          audio.src = url;
          const gainNode = getGainNode(audio);
          if (gainNode) {
            gainNode.gain.value = volume * (volumeNormalizationEnabled ? (track.loudnessGain ?? 1) : 1);
          }
          if (restore) {
            // Restoring the last session — resume position, but don't auto-play (browsers
            // block unprompted audio anyway, and it'd be surprising on a plain page load).
            audio.currentTime = restore.progress;
            progressRef.current = restore.progress;
            setProgress(restore.progress);
          } else {
            audio.currentTime = 0;
            await tryPlay(audio, audioContextRef.current);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load track", err);
          setError(err instanceof Error ? err.message : "Failed to load track");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load(currentFile);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.id, session?.accessToken]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (fadeObjectUrlRef.current) URL.revokeObjectURL(fadeObjectUrlRef.current);
    };
  }, []);

  // Scores tracks with the listening model so shuffle can lean toward ones it predicts
  // you'll enjoy more, while still covering the whole set once before any repeat.
  const computeWeightsFor = useCallback(
    (files: DriveFile[]) => {
      const now = new Date();
      return files.map((f) =>
        predict(
          model,
          extractFeatures(f, cachedTracks.get(f.id)?.parsedMeta, now),
        ),
      );
    },
    [model, cachedTracks],
  );

  // Saves a snapshot of "what's playing and how" so a refresh (or leaving to /admin and back)
  // can restore it. A no-op while nothing is queued, so it can never clobber a real saved
  // session with empty state (e.g. before the initial queue/currentIndex restore resolves).
  // Takes progress explicitly (from `progressRef`, not the `progress` state) so this
  // function's identity doesn't change 4x/second while a track is playing.
  const persistSession = useCallback(
    (currentProgress: number) => {
      if (queue.length === 0 || currentIndex === null) return;
      savePlaybackSession({
        id: "default",
        queue,
        currentIndex,
        source: currentSource,
        progress: currentProgress,
        shuffle,
        shuffleOrder,
        loopMode,
        volume,
      });
    },
    [queue, currentIndex, currentSource, shuffle, shuffleOrder, loopMode, volume],
  );

  // Persists whenever the queue/track/source/shuffle/loop/volume changes — these change
  // infrequently, so an immediate (non-throttled) save is fine here.
  useEffect(() => {
    persistSession(progressRef.current);
  }, [persistSession]);

  const play = useCallback(
    (newQueue: DriveFile[], index: number, source?: PlaySource) => {
      cancelCrossfade();
      // Shuffle stays on across a new queue — eagerly seed a fresh windowed shuffle order
      // right away (pinned at the starting track) so "Up Next" is correct immediately, not
      // just after the first skip. But picking a track out of "Up Next" (Player.tsx) calls this
      // with the *same* queue, and reseeding there would re-randomize every remaining track
      // just because one of them was jumped to — keep the existing order in that case, and let
      // the pin move to `index` inside it.
      const sameQueue =
        newQueue.length === queue.length &&
        newQueue.every((f, i) => f.id === queue[i]?.id);
      setShuffleOrder((order) =>
        shuffle && sameQueue && order.includes(index)
          ? order
          : shuffle && newQueue.length > 0
            ? seedShuffleWindow(newQueue.length, index, computeWeightsFor(newQueue))
            : [],
      );
      setQueue(newQueue);
      setCurrentIndex(index);
      setCurrentSource(source ?? null);
      setPlayNextIndex(null);
      if (source) {
        recordRecentSource({
          ...source,
          tracks: newQueue,
          lastPlayedAt: Date.now(),
        }).then(refreshRecentSources);
      }
    },
    [shuffle, queue, computeWeightsFor, refreshRecentSources, cancelCrossfade],
  );

  // Makes `file` play right after the current track — not at the end of the queue. If it's
  // already somewhere in the queue (which is the common case: everything shown in "Up Next"
  // is, by definition, already queued), this *moves* it there instead of being a no-op, so the
  // button is actually useful from Up Next too. Never creates a second, duplicate entry for
  // the same track (duplicates would also collide as React keys in the "Up Next" list).
  const addToQueue = useCallback(
    (file: DriveFile) => {
      // Decided against the outer `queue`/`currentIndex` state (not inside the `setQueue`
      // updater below) so this side effect runs exactly once, not potentially twice under
      // React Strict Mode's dev-only double-invocation of updater functions.
      const alreadyPlayingThis = queue.some(
        (f, i) => f.id === file.id && i === currentIndex,
      );
      if (alreadyPlayingThis) return;
      cancelCrossfade();

      setQueue((prev) => {
        if (prev.length === 0) {
          setCurrentIndex(0);
          setPlayNextIndex(null);
          setShuffleOrder([]);
          return [file];
        }

        const existingIndex = prev.findIndex((f) => f.id === file.id);
        const withoutFile =
          existingIndex === -1 ? prev : prev.filter((f) => f.id !== file.id);
        // Removing an earlier occurrence shifts every following index (including the current
        // track's) down by one — track where the currently-playing track ends up.
        const adjustedCurrentIndex =
          existingIndex !== -1 &&
          currentIndex !== null &&
          existingIndex < currentIndex
            ? currentIndex - 1
            : (currentIndex ?? 0);

        const insertAt = adjustedCurrentIndex + 1;
        const nextQueue = [...withoutFile];
        nextQueue.splice(insertAt, 0, file);

        if (adjustedCurrentIndex !== currentIndex) {
          setCurrentIndex(adjustedCurrentIndex);
        }
        setPlayNextIndex(insertAt);
        // Remap the stored positions in place. Discarding the order here would make the whole
        // rest of "Up Next" re-randomize just because one track was queued next.
        setShuffleOrder((order) =>
          order.length === 0
            ? order
            : remapShuffleOrderAfterInsert(
                order,
                existingIndex === -1 ? null : existingIndex,
                insertAt,
                adjustedCurrentIndex,
              ),
        );
        return nextQueue;
      });

      showToast(`Will play next: ${file.name.replace(/\.[^./]+$/, "")}`);
    },
    [queue, currentIndex, showToast, cancelCrossfade],
  );

  // Removes a queue entry by position (used by the "Up Next" list, which never shows the
  // currently-playing track, so `index` here is always something other than `currentIndex`).
  const removeFromQueue = useCallback(
    (index: number) => {
      const removed = queue[index];
      if (!removed || index === currentIndex) return;
      cancelCrossfade();

      setQueue((prev) => prev.filter((_, i) => i !== index));
      setCurrentIndex((idx) => (idx !== null && index < idx ? idx - 1 : idx));
      setPlayNextIndex((pIdx) => {
        if (pIdx === null || pIdx === index) return null;
        return pIdx > index ? pIdx - 1 : pIdx;
      });
      // Shift the stored positions past the hole instead of dropping the order — regenerating
      // it would re-randomize the entire rest of "Up Next" on every single delete.
      setShuffleOrder((order) =>
        order.length === 0 ? order : remapShuffleOrderAfterRemoval(order, index),
      );

      showToast(`Removed from queue: ${removed.name.replace(/\.[^./]+$/, "")}`);
    },
    [queue, currentIndex, showToast, cancelCrossfade],
  );

  const togglePlay = useCallback(() => {
    const audio = getActiveAudio();
    if (!audio) return;
    if (audio.paused) {
      void tryPlay(audio, audioContextRef.current);
    } else {
      // Pausing mid-crossfade would otherwise leave the inactive element silently playing (or
      // stuck at a partial volume) — simplest correct behavior is to cut the fade short.
      cancelCrossfade();
      audio.pause();
    }
  }, [getActiveAudio, cancelCrossfade]);

  // Spacebar toggles play/pause anywhere in the app — except while the user is actually
  // typing/focused on an interactive element, where Space needs to keep doing its normal job
  // (insert a space, activate a focused button, ...) instead of being hijacked.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInteractiveTarget =
        target?.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        tag === "A";
      if (isInteractiveTarget || !currentFile) return;

      e.preventDefault(); // stop the page from scrolling on Space
      if (e.repeat) return; // held down — keep suppressing scroll, but don't toggle repeatedly
      togglePlay();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentFile, togglePlay]);

  // A backgrounded tab can get a spurious `pause` (and no matching `play` back) fired on the
  // active audio element — browsers sometimes hiccup background media playback this way for
  // power/CPU throttling, especially with no Media Session API registered to mark this as
  // legitimate background audio. The element itself keeps right on playing, but `isPlaying`
  // is left stuck at false, showing the Play icon over audio that's still actually going.
  // Resyncing from the DOM's own `paused` truth whenever the tab regains visibility catches
  // this without needing to chase the browser's exact throttling behavior.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const audio = getActiveAudio();
      if (!audio) return;
      setIsPlaying((current) => (current === audio.paused ? !audio.paused : current));
      // iOS Safari suspends the shared AudioContext while the app is backgrounded — since
      // every audio element's output is routed exclusively through it (see ensureAudioGraph),
      // a suspended context silences playback even though `audio.paused` never changes.
      // Resume it here so audio that was genuinely still meant to be playing is actually
      // audible again, instead of depending on iOS's own (inconsistent) auto-resume.
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === "suspended" && !audio.paused) void ctx.resume();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [getActiveAudio]);

  // Returns [order, positionOfPinned], reseeding the window only when it's stale (`pinned`
  // isn't in it — a fresh queue, or shuffle was just turned on) — a cheap no-op otherwise.
  // `order` is deliberately not the whole queue shuffled — see seedShuffleWindow.
  const resolveShuffleOrder = useCallback(
    (pinned: number): { order: number[]; position: number } => {
      let order = shuffleOrder;
      if (!order.includes(pinned)) {
        order = seedShuffleWindow(queue.length, pinned, computeWeightsFor(queue));
      }
      return { order, position: order.indexOf(pinned) };
    },
    [shuffleOrder, queue, computeWeightsFor],
  );

  // What plays after `fromIndex` in shuffle mode, growing the window by one (weighted-random,
  // no repeats until every track's been queued once) so "Up Next" stays topped up around
  // SHUFFLE_WINDOW tracks instead of the whole library being shuffled once up front. Returns
  // null only when there's genuinely nothing left (loop off, every track already played).
  // Shared by next() and handleEnded() so manual skip and natural end-of-track agree.
  const advanceShuffle = useCallback(
    (fromIndex: number): number | null => {
      const resolved = resolveShuffleOrder(fromIndex);
      let order = resolved.order;
      const nextPosition = resolved.position + 1;
      const weights = computeWeightsFor(queue);
      if (nextPosition >= order.length) {
        order = growShuffleWindow(order, queue.length, weights, loopMode === "off", fromIndex);
        if (nextPosition >= order.length) {
          setShuffleOrder(order);
          return null;
        }
      }
      const remainingAhead = order.length - (nextPosition + 1);
      if (remainingAhead < SHUFFLE_WINDOW - 1) {
        order = growShuffleWindow(order, queue.length, weights, loopMode === "off", order[nextPosition]);
      }
      setShuffleOrder(order);
      return order[nextPosition];
    },
    [resolveShuffleOrder, computeWeightsFor, queue, loopMode],
  );

  // next()/prev() read `currentIndex` directly (not via setCurrentIndex's functional-updater
  // form) specifically so advanceShuffle/resolveShuffleOrder's setShuffleOrder call happens as
  // a plain top-level state update, never nested inside another setter's updater function.
  // React is allowed to re-invoke an updater function (Strict Mode does this on purpose, to
  // surface exactly this kind of bug) — a nested, randomness-driven setShuffleOrder call would
  // then fire twice with two different random picks, leaving currentIndex and shuffleOrder
  // referencing two different draws. That mismatch is invisible with a full-permutation
  // shuffle (every permutation contains every index), but with the rolling window it means
  // resolveShuffleOrder sees "current index isn't in the window" and reseeds a whole fresh
  // window from scratch — i.e. shuffle appearing to "re-shuffle everything" on every advance.
  const next = useCallback(() => {
    cancelCrossfade();
    if (queue.length === 0) return;
    if (currentIndex === null) {
      setCurrentIndex(0);
      return;
    }
    if (playNextIndex !== null) {
      setPlayNextIndex(null);
      setCurrentIndex(playNextIndex);
      return;
    }
    if (!shuffle) {
      setCurrentIndex((currentIndex + 1) % queue.length);
      return;
    }
    const advanced = advanceShuffle(currentIndex);
    if (advanced !== null) setCurrentIndex(advanced); // null (loop off, exhausted) — stay put
  }, [queue, currentIndex, shuffle, advanceShuffle, playNextIndex, cancelCrossfade]);

  const prev = useCallback(() => {
    cancelCrossfade();
    if (queue.length === 0) return;
    if (currentIndex === null) {
      setCurrentIndex(0);
      return;
    }
    if (!shuffle) {
      setCurrentIndex((currentIndex - 1 + queue.length) % queue.length);
      return;
    }
    const { order, position } = resolveShuffleOrder(currentIndex);
    setShuffleOrder(order);
    setCurrentIndex(order[Math.max(0, position - 1)]);
  }, [queue.length, currentIndex, shuffle, resolveShuffleOrder, cancelCrossfade]);

  // Loads the (already downloaded) next track into the idle audio element and leaves it paused
  // at 0:00, so `handleEnded` can start it immediately instead of the browser having to fetch
  // a blob URL, demux and decode first — which is exactly the silence between tracks that
  // gapless playback is meant to remove.
  const armGapless = useCallback(
    (targetIndex: number) => {
      const targetFile = queue[targetIndex];
      const cached = cachedTracks.get(targetFile?.id ?? "");
      const idle = getInactiveAudio();
      if (!targetFile || !cached || !idle) return;
      if (gaplessArmedRef.current?.fileId === targetFile.id) return;

      if (fadeObjectUrlRef.current) URL.revokeObjectURL(fadeObjectUrlRef.current);
      const url = URL.createObjectURL(cached.blob);
      fadeObjectUrlRef.current = url;
      idle.src = url;
      idle.currentTime = 0;
      // Silent until it's actually promoted — an armed element that never fires (the user
      // skipped, say) must not leak any audio, and `load()` is what forces the decode now.
      const idleGain = getGainNode(idle);
      if (idleGain) idleGain.gain.value = 0;
      idle.load();
      gaplessArmedRef.current = { fileId: targetFile.id, index: targetIndex };
    },
    [queue, cachedTracks, getInactiveAudio, getGainNode],
  );

  // Starts the armed track right now and commits the transition through the same path a
  // finished crossfade uses (crossfadeCommittedForRef → the load effect promotes the element
  // that's already playing rather than reloading it). Returns false if nothing was armed, in
  // which case the caller falls back to the normal end-of-track handling.
  const fireGapless = useCallback((): boolean => {
    const armed = gaplessArmedRef.current;
    if (!armed) return false;
    const incoming = getInactiveAudio();
    const incomingGain = getGainNode(incoming);
    if (!incoming || !incomingGain || !incoming.src) return false;
    gaplessArmedRef.current = null;

    incomingGain.gain.value = volume * trackGain(armed.fileId);
    incoming.currentTime = 0;
    void tryPlay(incoming, audioContextRef.current);

    crossfadeCommittedForRef.current = armed.fileId;
    if (playNextIndex === armed.index) setPlayNextIndex(null);
    setCurrentIndex(armed.index);
    return true;
  }, [getInactiveAudio, getGainNode, volume, trackGain, playNextIndex]);

  const handleEnded = useCallback(() => {
    // A crossfade already committed this transition (setCurrentIndex was called as the ramp
    // finished) — the native `ended` event firing moments later on the demoted element (if
    // timing was tight) shouldn't also run the normal end-of-track logic below.
    if (crossfadeStateRef.current || crossfadeCommittedForRef.current) return;

    // The next track is already decoded and waiting on the other element — start it here,
    // before anything below can go asynchronous. Skipped for loop-one, which never advances
    // (nothing gets armed for it either: peekNextIndex returns null).
    if (loopMode !== "one" && fireGapless()) return;

    if (loopMode === "one") {
      const audio = getActiveAudio();
      if (audio) {
        // A single-track loop never changes `currentFile.id`, so the load effect (which
        // normally trains the model on the outgoing track) never re-runs here — train
        // directly on each full play-through instead, or repeat listens would never teach
        // the model anything.
        if (currentFile) {
          const dur = audio.duration;
          const fraction =
            dur && Number.isFinite(dur) && dur > 0
              ? Math.min(1, audio.currentTime / dur)
              : 1;
          const features = extractFeatures(
            currentFile,
            currentMeta ?? undefined,
            new Date(),
          );
          const predicted = predict(model, features);
          setModel((prev) => trainStep(prev, features, fraction));
          void recordModelEvent({
            id: crypto.randomUUID(),
            trackId: currentFile.id,
            title: currentMeta?.title || currentFile.name,
            fraction,
            predicted,
            at: Date.now(),
          });
        }
        audio.currentTime = 0;
        void tryPlay(audio, audioContextRef.current);
      }
      return;
    }

    if (playNextIndex !== null) {
      const target = playNextIndex;
      setPlayNextIndex(null);
      setCurrentIndex(target);
      return;
    }

    if (shuffle) {
      // Reads currentIndex directly rather than via setCurrentIndex's updater form — see the
      // comment above next()/prev() for why nesting advanceShuffle's setShuffleOrder call
      // inside another setter's updater is what caused shuffle to appear to reseed itself.
      if (currentIndex !== null && queue.length > 0) {
        const advanced = advanceShuffle(currentIndex);
        if (advanced !== null) setCurrentIndex(advanced); // null (loop off, exhausted) — stop instead of reshuffling
      }
      return;
    }

    const isLast = currentIndex !== null && currentIndex === queue.length - 1;
    if (loopMode === "off" && isLast) {
      return; // Stop at the end of the queue instead of wrapping around.
    }

    next();
  }, [
    loopMode,
    shuffle,
    currentIndex,
    queue,
    next,
    advanceShuffle,
    playNextIndex,
    currentFile,
    currentMeta,
    model,
    getActiveAudio,
    fireGapless,
  ]);

  // Pure "what would play next" — mirrors handleEnded's decision tree but returns the answer
  // instead of committing it, so the crossfade trigger can peek ahead while the current track
  // is still playing. Deliberately bails (returns null, meaning "don't crossfade this one") on
  // loop-one and on exhausting the shuffle bag — both are handled fine by the existing
  // onEnded-driven path already, and folding them in here would mean threading their side
  // effects (bag regeneration, the loop-one restart) through the crossfade commit too.
  const peekNextIndex = useCallback((): number | null => {
    if (queue.length === 0 || currentIndex === null) return null;
    if (loopMode === "one") return null;
    if (playNextIndex !== null) return playNextIndex;
    if (shuffle) {
      const { order, position } = resolveShuffleOrder(currentIndex);
      if (position + 1 >= order.length) return null;
      return order[position + 1];
    }
    const isLast = currentIndex === queue.length - 1;
    if (loopMode === "off" && isLast) return null;
    return (currentIndex + 1) % queue.length;
  }, [queue, currentIndex, loopMode, playNextIndex, shuffle, resolveShuffleOrder]);

  // Applies the crossfade ramp's volume for "right now" (a pure function of wall-clock
  // elapsed time, not an incremental step), and commits the transition once it completes.
  // Called from both a requestAnimationFrame loop (smooth while the tab is foregrounded) and
  // every `timeupdate` (see handleTimeUpdate) — rAF gets throttled or fully suspended in a
  // backgrounded tab, which would otherwise freeze the fade indefinitely (or strand the
  // incoming track at a partial volume) the moment the user switches tabs. `timeupdate` fires
  // off actual audio playback instead, so it keeps the ramp correct regardless of tab
  // visibility; calling this twice for the same moment is harmless since it's idempotent.
  const advanceCrossfadeRamp = useCallback(() => {
    const state = crossfadeStateRef.current;
    if (!state) return;
    const t = Math.min(1, (performance.now() - state.startTime) / state.durationMs);
    state.incomingGain.gain.value = state.incomingTargetVolume * t;
    state.outgoingGain.gain.value = state.outgoingStartVolume * (1 - t);
    if (t >= 1) {
      crossfadeStateRef.current = null;
      crossfadeCommittedForRef.current = state.targetFile.id;
      if (playNextIndex === state.targetIndex) setPlayNextIndex(null);
      setCurrentIndex(state.targetIndex);
    }
  }, [playNextIndex]);

  // Starts fading `outgoing` out while the (already cached) next track fades in on the other
  // element. Only ever called with a target whose blob is already in memory — an uncached
  // next track just falls through to the normal onEnded-driven load, no crossfade attempted.
  const startCrossfade = useCallback(
    (targetIndex: number, outgoing: HTMLAudioElement) => {
      const targetFile = queue[targetIndex];
      const cached = cachedTracks.get(targetFile?.id ?? "");
      const incoming = getInactiveAudio();
      const incomingGain = getGainNode(incoming);
      const outgoingGain = getGainNode(outgoing);
      if (!targetFile || !cached || !incoming || !incomingGain || !outgoingGain) return;

      if (fadeObjectUrlRef.current) URL.revokeObjectURL(fadeObjectUrlRef.current);
      const url = URL.createObjectURL(cached.blob);
      fadeObjectUrlRef.current = url;
      incoming.src = url;
      incoming.currentTime = 0;
      incomingGain.gain.value = 0;
      void tryPlay(incoming, audioContextRef.current);

      // Never let the ramp outlast the outgoing track — `timeupdate` doesn't tick every
      // frame, so by the time this fires the real time left can already be a bit under
      // `crossfadeSeconds`. A ramp that runs past the track's natural end means the browser's
      // own end-of-media `pause` event fires while the ramp is still going, which (see
      // handlePause) would otherwise be misread as the user pausing and cancel the fade.
      const remaining = outgoing.duration - outgoing.currentTime;
      const durationMs = Math.max(0.01, Math.min(crossfadeSeconds, remaining)) * 1000;

      crossfadeStateRef.current = {
        startTime: performance.now(),
        durationMs,
        targetIndex,
        targetFile,
        // The outgoing gain node's current value already reflects its own normalization gain
        // (set when it started playing) — ramping proportionally down from there, not from
        // `volume` directly, keeps that gain intact through the fade-out.
        outgoingStartVolume: outgoingGain.gain.value,
        incomingTargetVolume: volume * trackGain(targetFile.id),
        incomingGain,
        outgoingGain,
      };

      const tick = () => {
        if (!crossfadeStateRef.current) return; // committed or cancelled elsewhere
        advanceCrossfadeRamp();
        if (crossfadeStateRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [
      queue,
      cachedTracks,
      getInactiveAudio,
      getGainNode,
      volume,
      crossfadeSeconds,
      advanceCrossfadeRamp,
      trackGain,
    ],
  );

  const seek = useCallback(
    (seconds: number) => {
      cancelCrossfade();
      const audio = getActiveAudio();
      if (audio) audio.currentTime = seconds;
      progressRef.current = seconds;
      setProgress(seconds);
    },
    [getActiveAudio, cancelCrossfade],
  );

  // Registers lock-screen/notification playback controls — the standard way to tell iOS/Android
  // this is legitimate background media playback rather than page audio they're free to
  // interrupt/silence when the app is backgrounded (see the AudioContext-resume logic in the
  // visibilitychange effect above for the other half of that fix).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => togglePlay());
    navigator.mediaSession.setActionHandler("pause", () => togglePlay());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number") seek(details.seekTime);
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [togglePlay, prev, next, seek]);

  // Keeps the lock-screen/notification metadata (title/artist/artwork) in sync with the
  // current track.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentFile) {
      navigator.mediaSession.metadata = null;
      return;
    }
    // iOS is strict about `artwork` entries — a `src` alone isn't enough; it silently drops
    // the image (no error, just no artwork shown) without a `type` and `sizes` too. The MIME
    // type is embedded in `pictureDataUrl` itself (`data:<format>;base64,...`, see
    // pictureToDataUrl in src/lib/metadata.ts), so it's pulled out of the string rather than
    // tracked separately. The real pixel dimensions of embedded cover art aren't known (it's
    // whatever size was baked into the file's tags), so `sizes` is a generic best-guess rather
    // than exact — sizes is a hint for picking among *multiple* candidates, not a strict
    // validator, so an approximate value is fine when there's only one image to offer anyway.
    const artworkType = currentMeta?.pictureDataUrl?.match(/^data:([^;]+);/)?.[1] ?? "image/jpeg";
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentMeta?.title || currentFile.name,
      artist: currentMeta?.artist || "",
      album: currentMeta?.album || "",
      artwork: currentMeta?.pictureDataUrl
        ? [{ src: currentMeta.pictureDataUrl, sizes: "512x512", type: artworkType }]
        : [],
    });
  }, [currentFile, currentMeta]);

  // Keeps the lock-screen/notification play/pause indicator in sync with actual playback state.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  const changeVolume = useCallback(
    (value: number) => {
      setVolumeState(value);
      const gainNode = getGainNode(getActiveAudio());
      if (gainNode && currentFile) gainNode.gain.value = value * trackGain(currentFile.id);
    },
    [getActiveAudio, getGainNode, currentFile, trackGain],
  );

  const removeFromCache = useCallback(
    async (fileId: string) => {
      await deleteCachedTrack(fileId);
      await refreshCachedTracks();
    },
    [refreshCachedTracks],
  );

  const downloadAll = useCallback(
    async (files: DriveFile[]) => {
      const targets = files.filter((f) => !cachedTracks.has(f.id));
      if (targets.length === 0) return;

      setDownloadProgress({ done: 0, total: targets.length });
      for (let i = 0; i < targets.length; i++) {
        try {
          const track = await ensureCached(targets[i], session?.accessToken);
          await refreshCachedTracks();
          // Awaited (one at a time) here rather than fire-and-forget like the single-track
          // load path — bulk-downloading a large playlist shouldn't spawn dozens of
          // concurrent AudioContexts decoding audio at once.
          await ensureLoudnessAnalyzed(track);
        } catch (err) {
          console.error(`Failed to download ${targets[i].name}`, err);
        }
        setDownloadProgress({ done: i + 1, total: targets.length });
      }
      setDownloadProgress(null);
    },
    [cachedTracks, session, refreshCachedTracks, ensureLoudnessAnalyzed],
  );

  // Loudness analysis normally happens opportunistically (whenever a track gets played or
  // bulk-downloaded) — this runs it over every already-downloaded track that hasn't been
  // analyzed yet, e.g. a library downloaded before volume normalization existed, with a
  // visible progress count instead of it happening silently one track at a time.
  const analyzeAllLoudness = useCallback(async () => {
    const targets = Array.from(cachedTracks.values()).filter(
      (t) => t.loudnessGain === undefined,
    );
    if (targets.length === 0) return;

    setAnalyzeProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      await ensureLoudnessAnalyzed(targets[i]);
      setAnalyzeProgress({ done: i + 1, total: targets.length });
    }
    setAnalyzeProgress(null);
  }, [cachedTracks, ensureLoudnessAnalyzed]);

  // Catches up a library downloaded before volume normalization existed (or before it was
  // last turned on) — runs once per session, the first time cached tracks include something
  // unanalyzed. New downloads/plays after that are already covered opportunistically (see
  // ensureLoudnessAnalyzed's call sites), so this only ever needs to fire once.
  const autoAnalyzeStartedRef = useRef(false);
  useEffect(() => {
    if (autoAnalyzeStartedRef.current) return;
    if (!volumeNormalizationEnabled || cachedTracks.size === 0) return;
    const hasUnanalyzed = Array.from(cachedTracks.values()).some(
      (t) => t.loudnessGain === undefined,
    );
    if (!hasUnanalyzed) return;
    autoAnalyzeStartedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kicks off a background catch-up scan, guarded by the ref above so it only ever fires once
    void analyzeAllLoudness();
  }, [cachedTracks, volumeNormalizationEnabled, analyzeAllLoudness]);

  const toggleShuffle = useCallback(() => {
    cancelCrossfade();
    const turningOn = !shuffle;
    // Eagerly seed the window right away (pinned at whatever's currently playing) so "Up
    // Next" reflects the shuffled order immediately, not just after the next skip.
    setShuffleOrder(
      turningOn && currentIndex !== null && queue.length > 0
        ? seedShuffleWindow(queue.length, currentIndex, computeWeightsFor(queue))
        : [],
    );
    setShuffle(turningOn);
  }, [shuffle, currentIndex, queue, computeWeightsFor, cancelCrossfade]);

  const cycleLoopMode = useCallback(() => {
    setLoopMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);

  // A track queued via "play next" always shows first, regardless of shuffle — the rest of
  // the list follows the actual shuffled order (or plain queue order) after it, skipping that
  // entry so it doesn't also appear a second time further down.
  // Keeps `shuffleOrder` valid (containing `currentIndex`, with enough tracks queued ahead)
  // as soon as it goes stale, instead of leaving that to whichever consumer happens to read it
  // next. `resolveShuffleOrder` reseeds on demand but doesn't persist its result, so without
  // this, `upNext`'s preview, a crossfade's early peek (`peekNextIndex`), and the actual advance
  // (`advanceShuffle`) could each independently reseed their own random window and disagree
  // with each other — "Up Next" showing one track, then a completely different one actually
  // playing. `addToQueue`/`removeFromQueue` deliberately remap the stored positions in place
  // (see `remapShuffleOrderAfterInsert`/`AfterRemoval`) rather than clearing them, precisely so
  // editing the queue never reaches the reseed below and re-randomizes what's already lined up.
  // This effect is what regenerates the order when it genuinely is stale, immediately, so every
  // consumer reads the same persisted order instead of racing separate reseeds. It also
  // tops the window back up after a crossfade commit, which changes `currentIndex` without ever
  // calling `advanceShuffle`/`growShuffleWindow` itself.
  useEffect(() => {
    if (!shuffle || currentIndex === null || queue.length === 0) return;
    const weights = computeWeightsFor(queue);
    if (!shuffleOrder.includes(currentIndex)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reseeding involves Math.random(), so it can't be plain derived-during-render state, and it must be persisted here (not left to whichever consumer reads it next) so every consumer agrees on the same order
      setShuffleOrder(seedShuffleWindow(queue.length, currentIndex, weights));
      return;
    }
    const position = shuffleOrder.indexOf(currentIndex);
    const remainingAhead = shuffleOrder.length - (position + 1);
    if (remainingAhead < SHUFFLE_WINDOW - 1) {
      const grown = growShuffleWindow(
        shuffleOrder,
        queue.length,
        weights,
        loopMode === "off",
        currentIndex,
      );
      if (grown.length !== shuffleOrder.length) setShuffleOrder(grown);
    }
  }, [shuffle, currentIndex, queue, shuffleOrder, computeWeightsFor, loopMode]);

  const upNext = useMemo<{ file: DriveFile; index: number }[]>(() => {
    if (currentIndex === null || queue.length === 0) return [];
    const result: { file: DriveFile; index: number }[] = [];
    if (playNextIndex !== null && playNextIndex < queue.length) {
      result.push({ file: queue[playNextIndex], index: playNextIndex });
    }
    const restIndices: number[] =
      shuffle && shuffleOrder.includes(currentIndex)
        ? shuffleOrder.slice(shuffleOrder.indexOf(currentIndex) + 1)
        : Array.from(
            { length: queue.length - currentIndex - 1 },
            (_, i) => currentIndex + 1 + i,
          );
    for (const index of restIndices) {
      if (index === playNextIndex) continue;
      if (result.length >= 20) break;
      result.push({ file: queue[index], index });
    }
    return result;
  }, [queue, currentIndex, shuffle, shuffleOrder, playNextIndex]);

  // Shared by both <audio> elements — each handler ignores events from whichever one isn't
  // currently "the" active element (e.g. the other one fading in during a crossfade).
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.currentTarget;
      // Runs for both elements (including the inactive one mid-fade-in) — see
      // advanceCrossfadeRamp's own comment for why this can't rely on rAF alone.
      advanceCrossfadeRamp();
      if (el !== getActiveAudio()) return;
      const t = el.currentTime;
      progressRef.current = t;
      setProgress(t);
      if (Date.now() - lastSessionSaveRef.current > SESSION_SAVE_THROTTLE_MS) {
        lastSessionSaveRef.current = Date.now();
        persistSession(t);
      }

      if (crossfadeStateRef.current) return;
      const dur = el.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const remaining = dur - t;
      if (remaining <= 0) return;

      // Crossfade wins when it's on: it already covers the join (and it needs the idle element
      // for its own fade-in, so both arming it and fading into it would fight over the same
      // element). Gapless is what handles the join when the transition is a straight cut.
      if (crossfadeEnabled && crossfadeSeconds > 0) {
        if (remaining > crossfadeSeconds) return;
        const target = peekNextIndex();
        if (target === null) return;
        startCrossfade(target, el);
        return;
      }

      if (!gaplessEnabled) return;
      if (remaining > GAPLESS_ARM_SECONDS) return;
      const target = peekNextIndex();
      if (target === null) return;
      armGapless(target);
    },
    [
      getActiveAudio,
      persistSession,
      crossfadeEnabled,
      crossfadeSeconds,
      gaplessEnabled,
      peekNextIndex,
      startCrossfade,
      armGapless,
      advanceCrossfadeRamp,
    ],
  );

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (e.currentTarget !== getActiveAudio()) return;
      setDuration(e.currentTarget.duration);
    },
    [getActiveAudio],
  );

  const handlePlay = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (e.currentTarget !== getActiveAudio()) return;
      setIsPlaying(true);
    },
    [getActiveAudio],
  );

  const handlePause = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (e.currentTarget !== getActiveAudio()) return;
      // The browser fires `pause` immediately before `ended` when a track reaches its
      // natural end. If a crossfade is still ramping at that exact moment (clock drift
      // between the audio element's own playback clock and the rAF-driven ramp, even with
      // the ramp clamped to the track's remaining time), let the ramp's own completion
      // commit the transition instead of reading this as the user pausing and cancelling
      // the already-fading-in next track.
      if (crossfadeStateRef.current) {
        if (e.currentTarget.ended) return;
        cancelCrossfade();
      }
      // Same story for a gapless join: this `pause` is the outgoing track hitting its end, and
      // `ended` (which starts the pre-buffered next track on the other element) is about to
      // fire. Reporting "paused" here would stick — the incoming element's own `play` event is
      // ignored while it's still the inactive one.
      if (e.currentTarget.ended && gaplessArmedRef.current) return;
      setIsPlaying(false);
      persistSession(progressRef.current);
    },
    [getActiveAudio, cancelCrossfade, persistSession],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentFile,
      currentMeta,
      isPlaying,
      isLoading,
      error,
      progress,
      duration,
      volume,
      cachedTracks,
      downloadProgress,
      shuffle,
      loopMode,
      isExpanded,
      recentSources,
      model,
      shuffleOrder,
      currentSource,
      playNextIndex,
      upNext,
      gaplessEnabled,
      setGaplessEnabled,
      crossfadeEnabled,
      crossfadeSeconds,
      setCrossfadeEnabled,
      setCrossfadeSeconds,
      volumeNormalizationEnabled,
      setVolumeNormalizationEnabled,
      eqEnabled,
      eqBass,
      eqMid,
      eqTreble,
      setEqEnabled,
      setEqBass,
      setEqMid,
      setEqTreble,
      visualizerEnabled,
      setVisualizerEnabled,
      spatialAudioEnabled,
      spatialAudioIntensity,
      setSpatialAudioEnabled,
      setSpatialAudioIntensity,
      getAudioLevel,
      play,
      addToQueue,
      removeFromQueue,
      togglePlay,
      next,
      prev,
      seek,
      changeVolume,
      removeFromCache,
      downloadAll,
      analyzeProgress,
      analyzeAllLoudness,
      toggleShuffle,
      cycleLoopMode,
      expand,
      collapse,
    }),
    [
      queue,
      currentFile,
      currentMeta,
      isPlaying,
      isLoading,
      error,
      progress,
      duration,
      volume,
      cachedTracks,
      downloadProgress,
      shuffle,
      loopMode,
      isExpanded,
      recentSources,
      model,
      shuffleOrder,
      currentSource,
      playNextIndex,
      upNext,
      gaplessEnabled,
      setGaplessEnabled,
      crossfadeEnabled,
      crossfadeSeconds,
      setCrossfadeEnabled,
      setCrossfadeSeconds,
      volumeNormalizationEnabled,
      setVolumeNormalizationEnabled,
      eqEnabled,
      eqBass,
      eqMid,
      eqTreble,
      setEqEnabled,
      setEqBass,
      setEqMid,
      setEqTreble,
      visualizerEnabled,
      setVisualizerEnabled,
      spatialAudioEnabled,
      spatialAudioIntensity,
      setSpatialAudioEnabled,
      setSpatialAudioIntensity,
      getAudioLevel,
      play,
      addToQueue,
      removeFromQueue,
      togglePlay,
      next,
      prev,
      seek,
      changeVolume,
      removeFromCache,
      downloadAll,
      analyzeProgress,
      analyzeAllLoudness,
      toggleShuffle,
      cycleLoopMode,
      expand,
      collapse,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioARef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
        // Buffer aggressively: an armed gapless track has to be fully decoded and ready to
        // start the instant the current one ends, and the default ("metadata" in some
        // browsers) would only fetch the header.
        preload="auto"
        className="hidden"
      />
      <audio
        ref={audioBRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
        // Buffer aggressively: an armed gapless track has to be fully decoded and ready to
        // start the instant the current one ends, and the default ("metadata" in some
        // browsers) would only fetch the header.
        preload="auto"
        className="hidden"
      />
    </PlayerContext.Provider>
  );
}

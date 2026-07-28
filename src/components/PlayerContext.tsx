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
import { createDefaultModel, predict, trainStep } from "@/lib/model";
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
} from "@/lib/db";

const SESSION_SAVE_THROTTLE_MS = 5000;

export type LoopMode = "off" | "all" | "one";

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

/**
 * Calls `audio.play()`, swallowing the browser's autoplay-policy rejection instead of letting
 * it surface as a scary raw error — this fires routinely when play() happens (e.g. after an
 * await for a slow download) too long after the user gesture that triggered it for the
 * browser's "transient activation" window to still be considered active. The track is left
 * loaded and paused; the user can just press play.
 */
async function tryPlay(audio: HTMLAudioElement): Promise<void> {
  try {
    await audio.play();
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") return;
    throw err;
  }
}

/** Returns the cached track for a file, downloading + parsing + storing it first if needed. */
async function ensureCached(file: DriveFile, accessToken: string | undefined): Promise<CachedTrack> {
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
export function weightedShuffledIndices(length: number, pinned: number, weights: number[]): number[] {
  const rest: { index: number; key: number }[] = [];
  for (let i = 0; i < length; i++) {
    if (i === pinned) continue;
    const weight = Math.max(weights[i] ?? 0.5, 0.001);
    rest.push({ index: i, key: Math.random() ** (1 / weight) });
  }
  rest.sort((a, b) => b.key - a.key);
  return [pinned, ...rest.map((r) => r.index)];
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
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
  const [cachedTracks, setCachedTracks] = useState<Map<string, CachedTrack>>(new Map());
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>("off");
  const [isExpanded, setIsExpanded] = useState(false);
  const [recentSources, setRecentSources] = useState<RecentSource[]>([]);
  const [model, setModel] = useState<ListeningModel>(() => createDefaultModel());
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [currentSource, setCurrentSource] = useState<PlaySource | null>(null);
  const [playNextIndex, setPlayNextIndex] = useState<number | null>(null);

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
      setLoopMode(session.loopMode);
      setVolumeState(session.volume);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentFile = currentIndex !== null ? (queue[currentIndex] ?? null) : null;

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
      const outgoingAudio = audioRef.current;
      const previousFile = previousFileRef.current;
      if (outgoingAudio && previousFile) {
        const dur = outgoingAudio.duration;
        const fraction = dur && Number.isFinite(dur) && dur > 0 ? Math.min(1, outgoingAudio.currentTime / dur) : 0;
        const features = extractFeatures(previousFile, currentMeta ?? undefined, new Date());
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

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(track.blob);
        objectUrlRef.current = url;
        setCurrentMeta(track.parsedMeta);

        const restore = pendingRestoreRef.current;
        pendingRestoreRef.current = null;

        const audio = audioRef.current;
        if (audio) {
          audio.src = url;
          if (restore) {
            // Restoring the last session — resume position, but don't auto-play (browsers
            // block unprompted audio anyway, and it'd be surprising on a plain page load).
            audio.currentTime = restore.progress;
            progressRef.current = restore.progress;
            setProgress(restore.progress);
          } else {
            audio.currentTime = 0;
            await tryPlay(audio);
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
    };
  }, []);

  // Scores tracks with the listening model so shuffle can lean toward ones it predicts
  // you'll enjoy more, while still covering the whole set once before any repeat.
  const computeWeightsFor = useCallback(
    (files: DriveFile[]) => {
      const now = new Date();
      return files.map((f) => predict(model, extractFeatures(f, cachedTracks.get(f.id)?.parsedMeta, now)));
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
        loopMode,
        volume,
      });
    },
    [queue, currentIndex, currentSource, shuffle, loopMode, volume],
  );

  // Persists whenever the queue/track/source/shuffle/loop/volume changes — these change
  // infrequently, so an immediate (non-throttled) save is fine here.
  useEffect(() => {
    persistSession(progressRef.current);
  }, [persistSession]);

  const play = useCallback(
    (newQueue: DriveFile[], index: number, source?: PlaySource) => {
      // Shuffle stays on across a new queue — eagerly deal a fresh model-weighted bag right
      // away (pinned at the starting track) so "Up Next" is correct immediately, not just
      // after the first skip.
      setShuffleOrder(
        shuffle && newQueue.length > 0
          ? weightedShuffledIndices(newQueue.length, index, computeWeightsFor(newQueue))
          : [],
      );
      setQueue(newQueue);
      setCurrentIndex(index);
      setCurrentSource(source ?? null);
      setPlayNextIndex(null);
      if (source) {
        recordRecentSource({ ...source, tracks: newQueue, lastPlayedAt: Date.now() }).then(refreshRecentSources);
      }
    },
    [shuffle, computeWeightsFor, refreshRecentSources],
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
      const alreadyPlayingThis = queue.some((f, i) => f.id === file.id && i === currentIndex);
      if (alreadyPlayingThis) return;

      setQueue((prev) => {
        if (prev.length === 0) {
          setCurrentIndex(0);
          setPlayNextIndex(null);
          setShuffleOrder([]);
          return [file];
        }

        const existingIndex = prev.findIndex((f) => f.id === file.id);
        const withoutFile = existingIndex === -1 ? prev : prev.filter((f) => f.id !== file.id);
        // Removing an earlier occurrence shifts every following index (including the current
        // track's) down by one — track where the currently-playing track ends up.
        const adjustedCurrentIndex =
          existingIndex !== -1 && currentIndex !== null && existingIndex < currentIndex
            ? currentIndex - 1
            : (currentIndex ?? 0);

        const insertAt = adjustedCurrentIndex + 1;
        const nextQueue = [...withoutFile];
        nextQueue.splice(insertAt, 0, file);

        if (adjustedCurrentIndex !== currentIndex) {
          setCurrentIndex(adjustedCurrentIndex);
        }
        setPlayNextIndex(insertAt);
        // The shuffle order's stored positions no longer line up after this reordering —
        // rather than remap it, just let it regenerate fresh on the next skip (the length
        // mismatch — or emptiness — is what `resolveShuffleOrder` checks for).
        setShuffleOrder([]);
        return nextQueue;
      });

      showToast(`Will play next: ${file.name.replace(/\.[^./]+$/, "")}`);
    },
    [queue, currentIndex, showToast],
  );

  // Removes a queue entry by position (used by the "Up Next" list, which never shows the
  // currently-playing track, so `index` here is always something other than `currentIndex`).
  const removeFromQueue = useCallback(
    (index: number) => {
      const removed = queue[index];
      if (!removed || index === currentIndex) return;

      setQueue((prev) => prev.filter((_, i) => i !== index));
      setCurrentIndex((idx) => (idx !== null && index < idx ? idx - 1 : idx));
      setPlayNextIndex((pIdx) => {
        if (pIdx === null || pIdx === index) return null;
        return pIdx > index ? pIdx - 1 : pIdx;
      });
      // Stale after this — regenerate fresh on the next skip (same reasoning as addToQueue).
      setShuffleOrder([]);

      showToast(`Removed from queue: ${removed.name.replace(/\.[^./]+$/, "")}`);
    },
    [queue, currentIndex, showToast],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void tryPlay(audio);
    else audio.pause();
  }, []);

  // Returns [order, positionOfPinned], regenerating the order only when it's stale
  // (queue size changed, or `pinned` isn't in it) — a cheap no-op otherwise.
  const resolveShuffleOrder = useCallback(
    (pinned: number): { order: number[]; position: number } => {
      let order = shuffleOrder;
      if (order.length !== queue.length || !order.includes(pinned)) {
        order = weightedShuffledIndices(queue.length, pinned, computeWeightsFor(queue));
      }
      return { order, position: order.indexOf(pinned) };
    },
    [shuffleOrder, queue, computeWeightsFor],
  );

  const next = useCallback(() => {
    setCurrentIndex((idx) => {
      if (queue.length === 0) return idx;
      if (idx === null) return 0;
      if (playNextIndex !== null) {
        const target = playNextIndex;
        setPlayNextIndex(null);
        return target;
      }
      if (!shuffle) return (idx + 1) % queue.length;

      const resolved = resolveShuffleOrder(idx);
      let order = resolved.order;
      const position = resolved.position;
      let nextPosition = position + 1;
      if (nextPosition >= order.length) {
        // Exhausted this shuffled pass — deal a fresh bag and keep going (manual skip always advances).
        order = weightedShuffledIndices(queue.length, idx, computeWeightsFor(queue));
        nextPosition = 0;
      }
      setShuffleOrder(order);
      return order[nextPosition];
    });
  }, [queue, shuffle, resolveShuffleOrder, computeWeightsFor, playNextIndex]);

  const prev = useCallback(() => {
    setCurrentIndex((idx) => {
      if (queue.length === 0) return idx;
      if (idx === null) return 0;
      if (!shuffle) return (idx - 1 + queue.length) % queue.length;

      const { order, position } = resolveShuffleOrder(idx);
      setShuffleOrder(order);
      return order[Math.max(0, position - 1)];
    });
  }, [queue.length, shuffle, resolveShuffleOrder]);

  const handleEnded = useCallback(() => {
    if (loopMode === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void tryPlay(audio);
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
      setCurrentIndex((idx) => {
        if (idx === null || queue.length === 0) return idx;
        const resolved = resolveShuffleOrder(idx);
        let order = resolved.order;
        const position = resolved.position;
        const atEndOfBag = position + 1 >= order.length;
        if (atEndOfBag && loopMode === "off") {
          setShuffleOrder(order);
          return idx; // Every track in this shuffled pass has played — stop instead of reshuffling.
        }
        let nextPosition = position + 1;
        if (atEndOfBag) {
          order = weightedShuffledIndices(queue.length, idx, computeWeightsFor(queue));
          nextPosition = 0;
        }
        setShuffleOrder(order);
        return order[nextPosition];
      });
      return;
    }

    const isLast = currentIndex !== null && currentIndex === queue.length - 1;
    if (loopMode === "off" && isLast) {
      return; // Stop at the end of the queue instead of wrapping around.
    }

    next();
  }, [loopMode, shuffle, currentIndex, queue, next, resolveShuffleOrder, computeWeightsFor, playNextIndex]);

  const seek = useCallback((seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
    progressRef.current = seconds;
    setProgress(seconds);
  }, []);

  const changeVolume = useCallback((value: number) => {
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);

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
          await ensureCached(targets[i], session?.accessToken);
          await refreshCachedTracks();
        } catch (err) {
          console.error(`Failed to download ${targets[i].name}`, err);
        }
        setDownloadProgress({ done: i + 1, total: targets.length });
      }
      setDownloadProgress(null);
    },
    [cachedTracks, session, refreshCachedTracks],
  );

  const toggleShuffle = useCallback(() => {
    const turningOn = !shuffle;
    // Eagerly deal the bag right away (pinned at whatever's currently playing) so "Up Next"
    // reflects the shuffled order immediately, not just after the next skip.
    setShuffleOrder(
      turningOn && currentIndex !== null && queue.length > 0
        ? weightedShuffledIndices(queue.length, currentIndex, computeWeightsFor(queue))
        : [],
    );
    setShuffle(turningOn);
  }, [shuffle, currentIndex, queue, computeWeightsFor]);

  const cycleLoopMode = useCallback(() => {
    setLoopMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);

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
        ref={audioRef}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          progressRef.current = t;
          setProgress(t);
          if (Date.now() - lastSessionSaveRef.current > SESSION_SAVE_THROTTLE_MS) {
            lastSessionSaveRef.current = Date.now();
            persistSession(t);
          }
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          persistSession(progressRef.current);
        }}
        className="hidden"
      />
    </PlayerContext.Provider>
  );
}

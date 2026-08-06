"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Heart,
  ListMusic,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Users,
  X,
} from "lucide-react";
import clsx from "clsx";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists } from "@/components/PlaylistsContext";
import { useSync } from "@/components/SyncContext";
import { getAverageColor } from "@/lib/color";
import { TrackRow } from "@/components/TrackRow";

const FALLBACK_GLOW = "rgb(120, 120, 120)";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FullPlayer() {
  const {
    queue,
    currentFile,
    currentMeta,
    cachedTracks,
    isPlaying,
    isLoading,
    error,
    progress,
    duration,
    shuffle,
    loopMode,
    isExpanded,
    currentSource,
    upNext,
    togglePlay,
    next,
    prev,
    seek,
    toggleShuffle,
    cycleLoopMode,
    collapse,
    removeFromQueue,
    visualizerEnabled,
    getAudioLevel,
  } = usePlayer();
  const { isFavorite, toggleFavorite } = usePlaylists();
  const { remoteNowPlaying, synced, toggleSynced, syncAvailable } = useSync();

  const [glowColor, setGlowColor] = useState(FALLBACK_GLOW);
  const [showQueue, setShowQueue] = useState(false);
  const glowRef = useRef<HTMLDivElement | null>(null);

  // Collapsing the player leaves this component mounted, so the sheet's state survives —
  // reopening Now Playing would come back with the queue already covering it. Adjusted during
  // render on the transition (React's recommended alternative to a setState-in-effect) rather
  // than only in the collapse button's handler, which isn't the only way out of this view.
  const [wasExpanded, setWasExpanded] = useState(isExpanded);
  if (wasExpanded !== isExpanded) {
    setWasExpanded(isExpanded);
    if (!isExpanded) setShowQueue(false);
  }

  useEffect(() => {
    let cancelled = false;
    if (!currentMeta?.pictureDataUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset glow when there's no artwork
      setGlowColor(FALLBACK_GLOW);
      return;
    }
    getAverageColor(currentMeta.pictureDataUrl).then((color) => {
      if (!cancelled) setGlowColor(color);
    });
    return () => {
      cancelled = true;
    };
  }, [currentMeta?.pictureDataUrl]);

  // Drives the ambient glow from the actual audio (via the shared analyser — see
  // getAudioLevel in PlayerContext) instead of the fixed-timer `breathe` CSS animation, while
  // this view is open and the setting's on. Sets style directly on the ref rather than through
  // React state, the same reasoning as everywhere else something needs to update every
  // animation frame: state at that rate would mean a render every frame for no benefit.
  useEffect(() => {
    const el = glowRef.current;
    if (!el || !isExpanded || !visualizerEnabled) return;
    // Hand control over from the CSS keyframe animation to this loop's own inline style, and
    // back again on cleanup — an inline style always wins over a class-based animation for the
    // same property, so leaving one set would otherwise freeze the CSS animation permanently.
    el.style.animation = "none";
    let smoothedLevel = 0;
    let rafId: number;
    const tick = () => {
      const level = getAudioLevel();
      smoothedLevel += (level - smoothedLevel) * 0.15;
      el.style.transform = `scale(${1 + smoothedLevel * 0.18})`;
      el.style.opacity = String(0.35 + smoothedLevel * 0.4);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      el.style.animation = "";
      el.style.transform = "";
      el.style.opacity = "";
    };
  }, [isExpanded, visualizerEnabled, getAudioLevel]);

  // Lock the page behind this overlay from scrolling while it's open — otherwise the main
  // page's own scroll region is still active underneath this one, producing two competing
  // scrollbars/scroll gestures at once.
  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);

  return (
    <div
      aria-hidden={!isExpanded}
      className={clsx(
        "fixed inset-0 z-50 flex flex-col overflow-hidden bg-white transition-all duration-300 ease-out dark:bg-black",
        isExpanded
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-6 opacity-0",
      )}
    >
      {/* The ambient backdrop is the cover art itself, blown up and blurred into a soft wash
          of the track's own colours, rather than the flat average-colour fill it used to be.
          The average colour stays underneath as the fill for tracks with no artwork (and while
          one is decoding). Inset well past the 100px blur radius on every side: unlike a flat
          fill, a blurred *image* fades toward transparent at its own edges, which would show
          as a vignette around the viewport if the layer stopped any closer in. */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute -inset-40 animate-[breathe_30s_ease-in-out_infinite] bg-cover bg-center blur-[100px]"
        style={{
          backgroundColor: glowColor,
          backgroundImage: currentMeta?.pictureDataUrl
            ? `url(${currentMeta.pictureDataUrl})`
            : undefined,
          transition: "background-color 700ms ease-out",
        }}
      />

      <div className="relative flex items-center justify-between px-6 py-4">
        <button
          onClick={collapse}
          className="rounded-full p-2 text-zinc-500 transition active:scale-90 dark:text-zinc-400 dark:hover:bg-zinc-900 hover:bg-zinc-100"
          aria-label="Collapse player"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Now Playing
        </p>
        {/* Balances the collapse button on the left so "Now Playing" stays centred — the
            actions that used to sit here now live under the transport controls. */}
        <div className="w-9" />
      </div>

      <div className="relative flex flex-1 flex-col items-center gap-8 overflow-y-auto px-6 py-6">
        <div
          key={currentFile?.id ?? "none"}
          className={clsx(
            // Crisp, fully-opaque artwork with a real drop shadow — it used to have its edges
            // feathered into transparency to melt into the backdrop, which softened the
            // artwork itself. The blurred backdrop above now provides that halo instead.
            "flex h-64 w-64 shrink-0 animate-[fadeIn_500ms_ease-out] items-center justify-center overflow-hidden rounded-2xl shadow-2xl shadow-black/30 sm:h-80 sm:w-80",
            !currentMeta?.pictureDataUrl && "bg-zinc-100 dark:bg-zinc-800",
          )}
        >
          {currentMeta?.pictureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentMeta.pictureDataUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Music className="h-16 w-16 text-zinc-400" />
          )}
        </div>

        <div className="flex w-full max-w-sm items-center gap-3">
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-lg font-medium text-zinc-900 dark:text-zinc-50">
              {currentFile
                ? currentMeta?.title || currentFile.name
                : "No track playing"}
            </p>
            <p className="mt-1 truncate text-sm text-zinc-400">
              {error ? (
                <span className="text-red-500">{error}</span>
              ) : (
                [currentMeta?.artist, currentMeta?.album]
                  .filter(Boolean)
                  .join(" · ") || " "
              )}
            </p>
            {currentSource && (
              <p className="mt-0.5 truncate text-xs text-zinc-400">
                Playing from {currentSource.name}
              </p>
            )}
            {synced && remoteNowPlaying && (
              <p className="mt-0.5 flex items-center justify-center gap-1 truncate text-xs text-accent">
                <Users className="h-3 w-3" /> Synced with {remoteNowPlaying.deviceName}
              </p>
            )}
          </div>
          {currentFile && (
            <button
              onClick={() => toggleFavorite(currentFile)}
              className={clsx(
                "shrink-0 rounded-full p-2 transition active:scale-90 hover:bg-zinc-100 dark:hover:bg-zinc-900",
                isFavorite(currentFile.id) ? "text-red-500" : "text-zinc-400",
              )}
              aria-label={
                isFavorite(currentFile.id)
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
            >
              <Heart
                className={clsx(
                  "h-5 w-5",
                  isFavorite(currentFile.id) && "fill-current",
                )}
              />
            </button>
          )}
        </div>

        <div className="w-full max-w-sm">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(progress, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-zinc-400">
            <span className="tabular-nums">{formatTime(progress)}</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className={clsx(
              "rounded-full p-2 transition active:scale-90",
              shuffle
                ? "text-accent"
                : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
            )}
            aria-label="Toggle shuffle"
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button
            onClick={prev}
            disabled={!currentFile}
            className="rounded-full p-2 text-zinc-600 transition active:scale-90 disabled:active:scale-100 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!currentFile || isLoading}
            className="rounded-full bg-zinc-900 p-4 text-white transition active:scale-90 disabled:active:scale-100 hover:opacity-90 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6" />
            )}
          </button>
          <button
            onClick={next}
            disabled={!currentFile}
            className="rounded-full p-2 text-zinc-600 transition active:scale-90 disabled:active:scale-100 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <SkipForward className="h-5 w-5" />
          </button>
          <button
            onClick={cycleLoopMode}
            className={clsx(
              "rounded-full p-2 transition active:scale-90",
              loopMode !== "off"
                ? "text-accent"
                : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
            )}
            aria-label="Cycle repeat mode"
          >
            {loopMode === "one" ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Secondary actions, one step down from the transport row: same visual weight as each
            other, clearly below play/pause rather than tucked up in the header. */}
        <div className="-mt-4 flex items-center gap-6">
          {syncAvailable && (
            <button
              onClick={toggleSynced}
              className={clsx(
                "rounded-full p-2 transition active:scale-90",
                synced
                  ? "text-accent"
                  : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
              )}
              aria-label={synced ? "Stop listening together" : "Listen together"}
              title={synced ? "Listening together" : "Listen together"}
            >
              <Users className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => setShowQueue(true)}
            className="relative rounded-full p-2 text-zinc-400 transition active:scale-90 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            aria-label="Show queue"
            title="Up Next"
          >
            <ListMusic className="h-5 w-5" />
            {upNext.length > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        </div>

      </div>

      {/* Sheet, not a separate portal: it belongs to this overlay, so it lives inside it and
          inherits its stacking context (and its aria-hidden while the player is collapsed). */}
      {showQueue && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-end">
          <button
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowQueue(false)}
            aria-label="Close queue"
          />
          {/* Capped and centred rather than edge-to-edge: on a wide window a full-width sheet
              stretches one narrow list of tracks across the whole screen. */}
          <div className="relative flex max-h-[70%] w-full max-w-md flex-col animate-[slideUp_250ms_ease-out] rounded-t-3xl border border-b-0 border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Up Next
              </p>
              <button
                onClick={() => setShowQueue(false)}
                className="rounded-full p-1.5 text-zinc-400 transition active:scale-90 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                aria-label="Close queue"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {upNext.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-zinc-400">Nothing queued after this track.</p>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto px-5 pb-4 dark:divide-zinc-900">
                {upNext.map(({ file, index }) => (
                  <TrackRow
                    key={`${file.id}-${index}`}
                    file={file}
                    queue={queue}
                    index={index}
                    cachedTrack={cachedTracks.get(file.id)}
                    onRemove={() => removeFromQueue(index)}
                    removeLabel="Remove from queue"
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

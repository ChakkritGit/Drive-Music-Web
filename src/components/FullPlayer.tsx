"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  Heart,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Users,
  Volume1,
  Volume2,
  VolumeX,
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
    volume,
    shuffle,
    loopMode,
    isExpanded,
    currentSource,
    upNext,
    togglePlay,
    next,
    prev,
    seek,
    changeVolume,
    toggleShuffle,
    cycleLoopMode,
    collapse,
    removeFromQueue,
  } = usePlayer();
  const { isFavorite, toggleFavorite } = usePlaylists();
  const { remoteNowPlaying, synced, toggleSynced, syncAvailable } = useSync();

  const [glowColor, setGlowColor] = useState(FALLBACK_GLOW);
  const [lastVolume, setLastVolume] = useState(1);

  function toggleMute() {
    if (volume > 0) {
      setLastVolume(volume);
      changeVolume(0);
    } else {
      changeVolume(lastVolume || 1);
    }
  }

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

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
      <div
        className="pointer-events-none absolute -inset-20 animate-[breathe_6s_ease-in-out_infinite] blur-[100px]"
        style={{
          backgroundColor: glowColor,
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
        {syncAvailable ? (
          <button
            onClick={toggleSynced}
            className={clsx(
              "rounded-full p-2 transition active:scale-90",
              synced
                ? "text-emerald-500"
                : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            )}
            aria-label={synced ? "Stop listening together" : "Listen together"}
            title={synced ? "Listening together" : "Listen together"}
          >
            <Users className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      <div className="relative flex flex-1 flex-col items-center gap-8 overflow-y-auto px-6 py-6">
        <div
          key={currentFile?.id ?? "none"}
          className="flex h-64 w-64 shrink-0 animate-[fadeIn_500ms_ease-out] items-center justify-center overflow-hidden rounded-2xl bg-zinc-100 shadow-xl sm:h-80 sm:w-80 dark:bg-zinc-800"
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
              <p className="mt-0.5 flex items-center justify-center gap-1 truncate text-xs text-emerald-500">
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
            className="w-full accent-zinc-900 dark:accent-zinc-100"
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
                ? "text-emerald-500"
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
                ? "text-emerald-500"
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

        <div className="mx-auto flex w-full max-w-[12rem] items-center gap-2">
          <button
            onClick={toggleMute}
            className="rounded-full p-1.5 text-zinc-400 transition active:scale-90 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            aria-label={volume === 0 ? "Unmute" : "Mute"}
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="flex-1 accent-zinc-900 dark:accent-zinc-100"
          />
        </div>

        {upNext.length > 0 && (
          <div className="w-full max-w-sm rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900/60">
            <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Up Next
            </p>
            <ul className="max-h-64 divide-y divide-zinc-200/70 overflow-y-auto dark:divide-zinc-800/70">
              {upNext.map(({ file, index }) => (
                <TrackRow
                  key={`${file.id}-${index}`}
                  file={file}
                  queue={queue}
                  index={index}
                  cachedTrack={cachedTracks.get(file.id)}
                  onRemove={() => removeFromQueue(index)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

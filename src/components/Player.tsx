"use client";

import { ChevronUp, Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import clsx from "clsx";
import { usePlayer } from "@/components/PlayerContext";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Player() {
  const {
    currentFile,
    currentMeta,
    isPlaying,
    isLoading,
    error,
    progress,
    duration,
    volume,
    shuffle,
    loopMode,
    togglePlay,
    next,
    prev,
    seek,
    changeVolume,
    toggleShuffle,
    cycleLoopMode,
    expand,
  } = usePlayer();

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/95">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-3">
        <button
          onClick={expand}
          disabled={!currentFile}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 disabled:cursor-default dark:bg-zinc-800"
          aria-label="Expand player"
        >
          {currentMeta?.pictureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentMeta.pictureDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music className="h-5 w-5 text-zinc-400" />
          )}
        </button>

        <button onClick={expand} disabled={!currentFile} className="min-w-0 flex-1 text-left disabled:cursor-default">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {currentFile ? currentMeta?.title || currentFile.name : "No track playing"}
          </p>
          <p className="truncate text-xs text-zinc-400">
            {error ? <span className="text-red-500">{error}</span> : currentMeta?.artist || " "}
          </p>
        </button>

        <div className="hidden items-center gap-0.5 sm:flex">
          <button
            onClick={toggleShuffle}
            className={clsx(
              "rounded-full p-1.5 transition",
              shuffle ? "text-emerald-500" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
            )}
            aria-label="Toggle shuffle"
          >
            <Shuffle className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={cycleLoopMode}
            className={clsx(
              "rounded-full p-1.5 transition",
              loopMode !== "off" ? "text-emerald-500" : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
            )}
            aria-label="Cycle repeat mode"
          >
            {loopMode === "one" ? <Repeat1 className="h-3.5 w-3.5" /> : <Repeat className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            disabled={!currentFile}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!currentFile || isLoading}
            className="rounded-full bg-zinc-900 p-2.5 text-white transition hover:opacity-90 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={next}
            disabled={!currentFile}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <Volume2 className="h-4 w-4 text-zinc-400" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-20 accent-zinc-900 dark:accent-zinc-100"
          />
        </div>

        <button
          onClick={expand}
          disabled={!currentFile}
          className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900"
          aria-label="Expand player"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 pb-3 text-xs text-zinc-400">
        <span className="tabular-nums">{formatTime(progress)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(progress, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 accent-zinc-900 dark:accent-zinc-100"
        />
        <span className="tabular-nums">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronUp,
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
  Volume2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { usePlayer } from "@/components/PlayerContext";
import { useSync } from "@/components/SyncContext";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Routes inside the (app) route group (see app/(app)/layout.tsx's NAV_ITEMS) — the only ones
// that render the mobile bottom tab nav.
const APP_GROUP_ROUTES = ["/", "/browse", "/playlists", "/library"];

// Legal pages are standalone documents (also linked from the signed-out screen) — the playback
// bar has nothing to do with reading them, so it stays out of the way entirely there.
const PLAYER_HIDDEN_ROUTES = ["/privacy", "/terms"];

export function Player() {
  const {
    queue,
    currentFile,
    currentMeta,
    currentSource,
    isPlaying,
    isLoading,
    error,
    progress,
    duration,
    volume,
    shuffle,
    loopMode,
    upNext,
    play,
    togglePlay,
    next,
    prev,
    seek,
    changeVolume,
    toggleShuffle,
    cycleLoopMode,
    expand,
  } = usePlayer();
  const { remoteNowPlaying, synced, toggleSynced } = useSync();
  const pathname = usePathname();
  const { status } = useSession();
  // Only surface what's playing on another device while this one isn't actively playing —
  // once this device is playing its own track, its own state is what matters locally. Not
  // gated on `currentFile` alone: a restored-but-paused session (see PlayerContext's
  // loadPlaybackSession effect) would otherwise permanently hide the banner after the very
  // first local play, since a device almost always has *some* track loaded after that.
  const remoteTrack = !isPlaying ? remoteNowPlaying : null;
  const remoteFile = remoteTrack?.queue[remoteTrack.currentIndex];
  // The mobile bottom tab nav (see app/(app)/layout.tsx) renders only for routes inside that
  // route group (home/browse/playlists/library) once signed in — /admin, /settings, /privacy,
  // /terms, and any other standalone route are all outside it and never get one. Checked as an
  // inclusion list (which routes DO have it) rather than an exclusion list (which routes don't)
  // — an exclusion list silently breaks for every new standalone page (this is exactly how
  // /settings ended up reserving space for a bottom nav that was never actually there, leaving
  // the bar floating above the real bottom edge instead of sitting flush against it).
  // Everywhere the nav is absent, this bar is the bottommost fixed element, so it alone is
  // responsible for clearing the gesture area there; when the nav is present, this bar instead
  // sits just above it, which already clears it.
  const hasBottomNav =
    status === "authenticated" &&
    APP_GROUP_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    );
  const [showUpNext, setShowUpNext] = useState(false);

  // After every hook above — the Player is mounted globally (Providers.tsx), so bailing out here
  // only hides the bar; playback and all its state keep running untouched.
  if (
    PLAYER_HIDDEN_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`),
    )
  ) {
    return null;
  }

  return (
    <div
      className={clsx(
        "fixed inset-x-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/95",
        hasBottomNav
          ? "bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:bottom-0"
          : "bottom-0",
      )}
    >
      {showUpNext && upNext.length > 0 && (
        <div className="absolute inset-x-0 bottom-full mb-3 flex justify-center px-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-900">
              <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Up Next
              </p>
              <button
                onClick={() => setShowUpNext(false)}
                className="cursor-pointer rounded-full p-1 text-zinc-400 transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
                aria-label="Close up next"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-900">
              {upNext.slice(0, 5).map(({ file, index }) => (
                <li key={`${file.id}-${index}`}>
                  <button
                    onClick={() => {
                      play(queue, index, currentSource ?? undefined);
                      setShowUpNext(false);
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                      <Music className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
                      {file.name.replace(/\.[^./]+$/, "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div
        className={clsx(
          "mx-auto flex max-w-2xl items-center gap-2 px-6 text-xs text-zinc-400",
          // On mobile with the bottom tab nav present, this bar already sits above it (which
          // clears the gesture area itself) — no need to double up on safe-area padding here.
          hasBottomNav
            ? "pt-3"
            : "pt-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
      >
        <span className="tabular-nums">{formatTime(progress)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(progress, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
        <span className="tabular-nums">{formatTime(duration)}</span>
      </div>

      <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-3 pb-8 md:pb-4">
        <button
          onClick={expand}
          disabled={!currentFile}
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 disabled:cursor-default dark:bg-zinc-800"
          aria-label="Expand player"
        >
          {currentMeta?.pictureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentMeta.pictureDataUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Music className="h-5 w-5 text-zinc-400" />
          )}
        </button>

        <button
          onClick={expand}
          disabled={!currentFile}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {remoteTrack && remoteFile
              ? remoteFile.name.replace(/\.[^./]+$/, "")
              : currentFile
                ? currentMeta?.title || currentFile.name
                : "No track playing"}
          </p>
          <p className="truncate text-xs text-zinc-400">
            {error ? (
              <span className="text-red-500">{error}</span>
            ) : remoteTrack ? (
              `Playing on ${remoteTrack.deviceName}`
            ) : synced && remoteNowPlaying ? (
              `Synced with ${remoteNowPlaying.deviceName}`
            ) : (
              currentMeta?.artist || " "
            )}
          </p>
        </button>

        <div className="hidden items-center gap-0.5 sm:flex">
          <button
            onClick={toggleShuffle}
            className={clsx(
              "rounded-full p-1.5 transition",
              shuffle
                ? "text-accent"
                : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
            )}
            aria-label="Toggle shuffle"
          >
            <Shuffle className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={cycleLoopMode}
            className={clsx(
              "rounded-full p-1.5 transition",
              loopMode !== "off"
                ? "text-accent"
                : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
            )}
            aria-label="Cycle repeat mode"
          >
            {loopMode === "one" ? (
              <Repeat1 className="h-3.5 w-3.5" />
            ) : (
              <Repeat className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {remoteTrack ? (
            <button
              onClick={toggleSynced}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Users className="h-3.5 w-3.5" /> Listen together
            </button>
          ) : (
            <>
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
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={next}
                disabled={!currentFile}
                className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </>
          )}
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
            className="w-20 accent-accent"
          />
        </div>

        <button
          onClick={() => setShowUpNext((v) => !v)}
          disabled={upNext.length === 0}
          className={clsx(
            "cursor-pointer rounded-full p-2 transition disabled:cursor-default disabled:opacity-30",
            showUpNext
              ? "text-accent"
              : "text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900",
          )}
          aria-label="Toggle up next"
        >
          <ListMusic className="h-4 w-4" />
        </button>

        <button
          onClick={expand}
          disabled={!currentFile}
          className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-900"
          aria-label="Expand player"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

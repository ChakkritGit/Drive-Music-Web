"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ListMusic,
  MonitorSpeaker,
  Music,
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
import { PlayPauseIcon } from "@/components/PlayPauseIcon";
import { useSync } from "@/components/SyncContext";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Routes inside the (app) route group (see app/(app)/layout.tsx's NAV_ITEMS) — the only ones
// that render the mobile bottom tab nav.
const APP_GROUP_ROUTES = ["/", "/browse", "/playlists", "/library", "/settings"];

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
  const { remoteNowPlaying, synced, toggleSynced, syncAvailable } = useSync();
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
        "fixed inset-x-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95",
        // Inside the app shell: above the phone's bottom nav, and beside the desktop sidebar.
        hasBottomNav
          ? "bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:left-60"
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

      {/* Phones: the progress is a hairline along the top edge; the full slider lives in Now Playing. */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-zinc-200 lg:hidden dark:bg-zinc-800" aria-hidden="true">
        <div className="h-full bg-accent" style={{ width: `${duration ? Math.min(100, (progress / duration) * 100) : 0}%` }} />
      </div>

      <div
        className={clsx(
          "grid items-center gap-3 px-4 lg:h-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 lg:px-8",
          "grid-cols-[minmax(0,1fr)_auto]",
          // With the phone's bottom nav below, this bar already clears the gesture area.
          hasBottomNav ? "py-3.5 lg:py-0" : "pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] lg:py-0",
        )}
      >
        {/* Left: what is playing. Opens Now Playing. */}
        <button
          onClick={expand}
          disabled={!currentFile}
          className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-default"
          aria-label="Expand player"
        >
          {/* Round, like a record on the deck. */}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-950/5 lg:h-14 lg:w-14 dark:bg-zinc-800 dark:ring-white/10">
            {currentMeta?.pictureDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentMeta.pictureDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Music className="h-5 w-5 text-zinc-400" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-950 lg:text-base dark:text-zinc-50">
              {remoteTrack && remoteFile
                ? remoteFile.name.replace(/\.[^./]+$/, "")
                : currentFile
                  ? currentMeta?.title || currentFile.name
                  : "No track playing"}
            </span>
            <span className="block truncate text-xs text-zinc-500 lg:mt-0.5 lg:text-sm dark:text-zinc-400">
              {error ? (
                <span className="text-red-500">{error}</span>
              ) : remoteTrack ? (
                `Playing on ${remoteTrack.deviceName}`
              ) : synced && remoteNowPlaying ? (
                `Synced with ${remoteNowPlaying.deviceName}`
              ) : (
                currentMeta?.artist || " "
              )}
            </span>
          </span>
        </button>

        {/* Centre: the transport, and on a desktop the timeline under it. */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1 lg:gap-2">
            {remoteTrack ? (
              <button
                onClick={toggleSynced}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-semibold text-zinc-950 transition hover:brightness-95"
              >
                <Users className="h-3.5 w-3.5" /> Listen together
              </button>
            ) : (
              <>
                <IconButton
                  onClick={toggleShuffle}
                  label="Toggle shuffle"
                  active={shuffle}
                  className="hidden lg:grid"
                >
                  <Shuffle className="h-4 w-4" />
                </IconButton>
                <IconButton onClick={prev} disabled={!currentFile} label="Previous" className="hidden sm:grid">
                  <SkipBack className="h-[18px] w-[18px]" />
                </IconButton>
                <button
                  onClick={togglePlay}
                  disabled={!currentFile || isLoading}
                  className="grid h-10 w-10 place-items-center rounded-full bg-zinc-950 text-white transition hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-30 disabled:hover:scale-100 dark:bg-white dark:text-zinc-950"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  <PlayPauseIcon playing={isPlaying} className="h-4 w-4" />
                </button>
                <IconButton onClick={next} disabled={!currentFile} label="Next">
                  <SkipForward className="h-[18px] w-[18px]" />
                </IconButton>
                <IconButton
                  onClick={cycleLoopMode}
                  label="Cycle repeat mode"
                  active={loopMode !== "off"}
                  className="hidden lg:grid"
                >
                  {loopMode === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                </IconButton>
              </>
            )}
          </div>
          <div className="hidden w-full max-w-xl items-center gap-2.5 text-xs text-zinc-500 tabular-nums lg:flex dark:text-zinc-400">
            <span className="w-10 text-right">{formatTime(progress)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(progress, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              className="seek flex-1"
              style={{ "--pct": `${duration ? Math.min(100, (progress / duration) * 100) : 0}%` } as React.CSSProperties}
              aria-label="Seek"
            />
            <span className="w-10">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: listening on other devices, the queue, then volume at the far edge. Desktop only;
            on a phone these live in Now Playing. */}
        <div className="hidden items-center justify-end gap-1 lg:flex">
          {syncAvailable && (
            <IconButton
              onClick={toggleSynced}
              label={synced ? "Stop listening together" : "Listen together"}
              active={synced}
            >
              <MonitorSpeaker className="h-[18px] w-[18px]" />
            </IconButton>
          )}
          <IconButton
            onClick={() => setShowUpNext((v) => !v)}
            disabled={upNext.length === 0}
            label="Toggle up next"
            active={showUpNext}
          >
            <ListMusic className="h-[18px] w-[18px]" />
          </IconButton>
          <Volume2 className="mr-1 ml-2 h-[18px] w-[18px] shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="seek w-28"
            style={{ "--pct": `${volume * 100}%` } as React.CSSProperties}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}

/** A 36px round ghost button; `active` tints it with the accent (shuffle on, repeat on, queue open). */
function IconButton({
  onClick,
  label,
  active = false,
  disabled = false,
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      className={clsx(
        "grid h-9 w-9 place-items-center rounded-full transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-default disabled:opacity-30",
        active
          ? "text-accent-strong"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

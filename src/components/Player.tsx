"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ListMusic,
  Music,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { usePlayer } from "@/components/PlayerContext";
import { PlayPauseIcon } from "@/components/PlayPauseIcon";
import { useSync } from "@/components/SyncContext";
import { DevicePicker } from "@/components/DevicePicker";
import { TrackRow } from "@/components/TrackRow";
import { TransitionChip } from "@/components/TransitionChip";
import { SeekSlider } from "@/components/SeekSlider";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Routes inside the (app) route group (see app/(app)/layout.tsx's NAV_ITEMS) — the only ones
// that render the mobile bottom tab nav.
const APP_GROUP_ROUTES = ["/", "/browse", "/playlists", "/library", "/settings", "/admin"];

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
    isExpanded,
    error,
    progress,
    duration,
    volume,
    shuffle,
    loopMode,
    upNext,
    togglePlay,
    next,
    prev,
    seek,
    changeVolume,
    toggleShuffle,
    cycleLoopMode,
    expand,
    cachedTracks,
    removeFromQueue,
  } = usePlayer();
  const { outputName, outputId, deviceId, pendingOutputId } = useSync();
  const pathname = usePathname();
  const { status } = useSession();
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
  // The page makes room for the queue panel (see .app-content in globals.css).
  useEffect(() => {
    if (!showUpNext) return;
    document.documentElement.dataset.queueOpen = "";
    return () => {
      delete document.documentElement.dataset.queueOpen;
    };
  }, [showUpNext]);


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
    <>
    {/* The queue opens as a panel on the right, outside the bar: the bar's backdrop blur would
        otherwise make it the panel's containing block. */}
    {showUpNext && !isExpanded && (
      <aside
        aria-label="Up next"
        className={clsx(
          "fixed top-0 right-0 z-20 flex w-full animate-[slideInRight_220ms_ease-out] flex-col border-l border-zinc-200 bg-white shadow-2xl lg:w-96 lg:shadow-none dark:border-zinc-800 dark:bg-zinc-950",
          hasBottomNav ? "bottom-[calc(8.5rem+env(safe-area-inset-bottom))] lg:bottom-24" : "bottom-24",
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Up next</h2>
          <button
            onClick={() => setShowUpNext(false)}
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
            aria-label="Close up next"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {currentFile && upNext.length > 0 && (
          <div className="px-5 pb-2">
            <TransitionChip from={currentFile} to={upNext[0].file} />
          </div>
        )}
        {upNext.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-500 dark:text-zinc-400">Nothing queued after this track.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-4">
            {upNext.map(({ file, index }, position) => (
              <TrackRow
                key={`${file.id}-${index}`}
                file={file}
                queue={queue}
                index={index}
                source={currentSource ?? undefined}
                cachedTrack={cachedTracks.get(file.id)}
                nextFile={upNext[position + 1]?.file}
                onRemove={() => removeFromQueue(index)}
                removeLabel="Remove from queue"
              />
            ))}
          </ul>
        )}
      </aside>
    )}
    <div
      className={clsx(
        "fixed inset-x-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95",
        // Inside the app shell: above the phone's bottom nav, and beside the desktop sidebar.
        hasBottomNav
          ? "bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:left-60"
          : "bottom-0",
      )}
    >
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
              {currentFile ? currentMeta?.title || currentFile.name : "No track playing"}
            </span>
            <span className="block truncate text-xs text-zinc-500 lg:mt-0.5 lg:text-sm dark:text-zinc-400">
              {error ? (
                <span className="text-red-500">{error}</span>
              ) : pendingOutputId ? (
                "Switching output…"
              ) : outputName ? (
                outputId === deviceId ? "Sound on this device" : `Sound on ${outputName}`
              ) : (
                currentMeta?.artist || " "
              )}
            </span>
          </span>
        </button>

        {/* Centre: the transport, and on a desktop the timeline under it. */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1 lg:gap-2">
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
          </div>
          <div className="hidden w-full max-w-xl items-center gap-2.5 text-xs text-zinc-500 tabular-nums lg:flex dark:text-zinc-400">
            <span className="w-10 text-right">{formatTime(progress)}</span>
            <SeekSlider
              key={currentFile?.id ?? "none"}
              value={progress}
              duration={duration}
              onSeek={seek}
              className="seek flex-1"
            />
            <span className="w-10">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: listening on other devices, the queue, then volume at the far edge. Desktop only;
            on a phone these live in Now Playing. */}
        <div className="hidden items-center justify-end gap-1 lg:flex">
          <DevicePicker />
          <IconButton
            onClick={() => setShowUpNext((v) => !v)}
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
    </>
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

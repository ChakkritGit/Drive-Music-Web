"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Heart, ListMusic, Loader2, MonitorSpeaker, Music, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import clsx from "clsx";
import { usePlayer } from "@/components/PlayerContext";
import { PlayPauseIcon } from "@/components/PlayPauseIcon";
import { MixGlow } from "@/components/MixGlow";
import { usePlaylists } from "@/components/PlaylistsContext";
import { DevicePicker } from "@/components/DevicePicker";
import { useSync } from "@/components/SyncContext";
import { TrackRow } from "@/components/TrackRow";
import { TransitionChip } from "@/components/TransitionChip";
import { analysisSummary } from "@/lib/analysis";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;
}

export function FullPlayer() {
  const {
    queue, currentFile, currentMeta, cachedTracks, isPlaying, isLoading, error,
    progress, duration, volume, shuffle, loopMode, isExpanded, currentSource, upNext,
    togglePlay, next, prev, seek, changeVolume, toggleShuffle, cycleLoopMode, collapse,
    removeFromQueue, visualizerEnabled, getAudioLevel, crossfadeEnabled, autoMixEnabled, analyses,
    isPreviewingTransition,
  } = usePlayer();
  const { isFavorite, toggleFavorite } = usePlaylists();
  const { outputName, outputId, deviceId, pendingOutputId, connected, syncAvailable } = useSync();
  const [showQueue, setShowQueue] = useState(false);
  const [wasExpanded, setWasExpanded] = useState(isExpanded);
  const artworkGlow = useRef<HTMLDivElement>(null);
  const queueButton = useRef<HTMLButtonElement>(null);
  const mixSummary = currentFile ? analysisSummary(analyses.get(currentFile.id)) : "";
  const isMixReady = crossfadeEnabled && autoMixEnabled && currentFile !== null;
  const title = currentMeta?.title || currentFile?.name.replace(/\.[^./]+$/, "") || "No track playing";
  const favorited = currentFile ? isFavorite(currentFile.id) : false;

  if (wasExpanded !== isExpanded) {
    setWasExpanded(isExpanded);
    if (!isExpanded) setShowQueue(false);
  }

  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Menus and the mix editor own Escape while they are open.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (showQueue) { setShowQueue(false); queueButton.current?.focus(); }
      else collapse();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, showQueue, collapse]);

  // A restrained accent halo around the artwork, using the same audio analyser as before.
  useEffect(() => {
    const el = artworkGlow.current;
    if (!el || !isExpanded || !visualizerEnabled || !isPlaying
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame: number;
    let level = 0;
    const tick = () => {
      level += (getAudioLevel() - level) * 0.12;
      el.style.opacity = String(0.12 + level * 0.18);
      el.style.transform = `scale(${1 + level * 0.08})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); el.style.opacity = ""; el.style.transform = ""; };
  }, [isExpanded, visualizerEnabled, isPlaying, getAudioLevel]);

  return (
    <div
      aria-hidden={!isExpanded}
      inert={!isExpanded}
      className={clsx(
        "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        isExpanded ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <header className="mx-auto flex w-full max-w-[1480px] shrink-0 items-center justify-between gap-4 px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:px-12 lg:py-7">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={collapse} aria-label="Collapse player"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900">
            <ChevronDown className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">Now Playing</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{currentSource?.name || "Your music"}</p>
          </div>
        </div>
        <button ref={queueButton} onClick={() => setShowQueue(v => !v)} aria-label="Show queue"
          aria-expanded={showQueue} aria-controls="now-playing-queue"
          className={clsx("flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4",
            showQueue ? "border-accent/25 bg-accent/10 text-accent-strong" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900")}>
          <ListMusic className="h-4 w-4" />
          <span className="hidden sm:inline">Queue</span>
          {upNext.length > 0 && <span className="text-xs tabular-nums">{upNext.length}</span>}
        </button>
      </header>

      <div className="now-playing-layout mx-auto min-h-0 w-full max-w-[1480px] flex-1 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 lg:px-12 lg:pb-10" data-queue-open={showQueue}>
        <div data-now-playing-content className="now-playing-content min-h-0 min-w-0 overflow-y-auto overscroll-contain">
          <div className="relative mx-auto w-full max-w-[min(76vw,22rem)] shrink-0 lg:max-w-[min(32vh,18rem)] xl:max-w-[28rem]">
            <div ref={artworkGlow} aria-hidden="true" className="pointer-events-none absolute inset-6 rounded-full bg-accent opacity-[0.12] blur-3xl" />
            <div key={currentFile?.id ?? "none"} className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-3xl border border-zinc-950/5 bg-zinc-100 shadow-[0_20px_70px_-25px_rgba(0,0,0,0.28)] dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/40">
              {currentMeta?.pictureDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentMeta.pictureDataUrl} alt={`Cover art for ${title}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-4 text-zinc-300 dark:text-zinc-700">
                  <Music className="h-20 w-20 stroke-[1]" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.3em]">Drive Music</span>
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto flex w-full min-w-0 max-w-[25rem] flex-col py-1 lg:py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="mb-3 hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 xl:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {isPreviewingTransition ? "Paused for preview" : isLoading ? "Loading track" : isPlaying ? "Now Playing" : "Paused"}
                </p>
                <h1 className="text-balance break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl xl:text-4xl">{title}</h1>
                <p className="mt-2 truncate text-sm text-zinc-500 sm:text-base dark:text-zinc-400">{currentMeta?.artist || "Unknown artist"}</p>
                {currentMeta?.album && <p className="mt-1 truncate text-xs text-zinc-400 dark:text-zinc-500">{currentMeta.album}</p>}
              </div>
              {currentFile && <button onClick={() => toggleFavorite(currentFile)} aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={favorited} className={clsx("mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent xl:mt-7",
                  favorited ? "border-accent/20 bg-accent/10 text-accent-strong" : "border-zinc-200 text-zinc-400 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900")}>
                <Heart className={clsx("h-[18px] w-[18px]", favorited && "fill-current")} />
              </button>}
            </div>

            {error && <p role="status" className="mt-3 text-xs text-red-500">{error}</p>}
            <div className="mt-7 sm:mt-9">
              <input type="range" min={0} max={duration || 0} step={0.1} value={Math.min(progress, duration || 0)}
                onChange={e => seek(Number(e.target.value))} className="seek w-full" aria-label="Seek"
                style={{ "--pct": `${duration ? Math.min(100, progress / duration * 100) : 0}%` } as React.CSSProperties} />
              <div className="mt-1 flex justify-between text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                <span>{formatTime(progress)}</span><span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 sm:mt-6">
              <TransportButton onClick={toggleShuffle} label="Toggle shuffle" active={shuffle}><Shuffle className="h-[18px] w-[18px]" /></TransportButton>
              <TransportButton onClick={prev} label="Previous" disabled={!currentFile}><SkipBack className="h-6 w-6 fill-current" /></TransportButton>
              <span className="relative mx-3 inline-flex">
                {isMixReady && isExpanded && <MixGlow active={isPlaying} />}
                <button onClick={togglePlay} disabled={!currentFile || isLoading} aria-label={isPlaying ? "Pause" : "Play"}
                  className="relative z-10 grid h-16 w-16 place-items-center rounded-full bg-accent text-zinc-950 shadow-lg shadow-accent/15 transition hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background disabled:opacity-40 disabled:hover:scale-100">
                  {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <PlayPauseIcon playing={isPlaying} className="h-6 w-6" />}
                </button>
              </span>
              <TransportButton onClick={next} label="Next" disabled={!currentFile}><SkipForward className="h-6 w-6 fill-current" /></TransportButton>
              <TransportButton onClick={cycleLoopMode} label="Cycle repeat mode" active={loopMode !== "off"}>
                {loopMode === "one" ? <Repeat1 className="h-[18px] w-[18px]" /> : <Repeat className="h-[18px] w-[18px]" />}
              </TransportButton>
            </div>

            <div className="mt-7 flex items-center justify-between gap-4 border-t border-zinc-200/80 pt-5 dark:border-zinc-800">
              <div className="flex min-w-0 items-center gap-2">
                <DevicePicker />
                <div className="min-w-0 text-xs">
                  <p className="truncate text-zinc-600 dark:text-zinc-300">{pendingOutputId ? "Switching output…" : syncAvailable && !connected ? "Reconnecting…" : outputName ? outputId === deviceId ? "This device" : outputName : "Audio output"}</p>
                  {outputName && <p className="mt-0.5 text-[10px] text-zinc-400">{outputId === deviceId ? "Playing here" : "Control from here"}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Volume2 className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => changeVolume(Number(e.target.value))}
                  className="seek w-20 sm:w-24" aria-label="Volume" style={{ "--pct": `${volume * 100}%` } as React.CSSProperties} />
              </div>
            </div>
            {isMixReady && mixSummary && <p className="mt-4 text-[10px] tabular-nums text-zinc-400">{mixSummary}</p>}
          </div>
        </div>

        <div id="now-playing-queue" role="region" aria-label="Now Playing queue" aria-hidden={!showQueue} inert={!showQueue}
          className="now-playing-queue-shell" data-open={showQueue}>
          <button className="absolute inset-0 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setShowQueue(false)} aria-label="Dismiss queue" />
          <div className="now-playing-queue relative flex h-full min-h-0 flex-col overflow-hidden rounded-l-3xl border border-zinc-200 bg-zinc-50 pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-900/60 lg:rounded-3xl lg:pb-0">
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-4 pt-5">
              <div><h2 className="text-base font-semibold tracking-tight">Up Next</h2><p className="mt-1 text-xs text-zinc-400">{upNext.length} {upNext.length === 1 ? "track" : "tracks"} in queue</p></div>
              <button onClick={() => { setShowQueue(false); queueButton.current?.focus(); }} aria-label="Close queue"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
            </div>
            {currentFile && <div className="mx-4 mb-3 flex shrink-0 items-center gap-3 rounded-2xl border border-zinc-200/70 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/70">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                {currentMeta?.pictureDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentMeta.pictureDataUrl} alt="" className="h-full w-full object-cover" />
                ) : <Music className="h-5 w-5" />}
              </div>
              <div className="min-w-0"><p className="mb-1 text-[10px] font-medium text-accent-strong">{isPreviewingTransition ? "Paused for preview" : isPlaying ? "Playing now" : "Paused"}</p><p className="truncate text-xs font-medium">{title}</p><p className="mt-0.5 truncate text-[11px] text-zinc-400">{currentMeta?.artist || "Unknown artist"}</p></div>
            </div>}
            {currentFile && upNext.length > 0 && <div className="px-5 pb-2"><TransitionChip from={currentFile} to={upNext[0].file} /></div>}
            {upNext.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 pb-16 text-center text-zinc-400"><ListMusic className="h-8 w-8 stroke-[1.25]" /><p className="text-sm">You’re all caught up</p><p className="max-w-48 text-xs leading-relaxed">Add a track to keep the music going.</p></div> : (
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
                {upNext.map(({ file, index }, position) => <TrackRow key={`${file.id}-${index}`} file={file} queue={queue} index={index}
                  source={currentSource ?? undefined} cachedTrack={cachedTracks.get(file.id)} nextFile={upNext[position + 1]?.file}
                  onRemove={() => removeFromQueue(index)} removeLabel="Remove from queue" />)}
              </ul>
            )}
            <div className="flex shrink-0 items-center gap-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-400 dark:border-zinc-800">
              {syncAvailable ? <DevicePicker /> : <MonitorSpeaker className="h-4 w-4" />}
              <span className="truncate">{outputName || "Choose where to listen"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportButton({ onClick, label, active = false, disabled = false, children }: {
  onClick: () => void; label: string; active?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return <button onClick={onClick} aria-label={label} aria-pressed={active || undefined} disabled={disabled}
    className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30",
      active ? "bg-accent/10 text-accent-strong" : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900")}>{children}</button>;
}

"use client";

import { CloudCheck, Heart, Loader2, Music, Pause } from "lucide-react";
import clsx from "clsx";
import type { CachedTrack, DriveFile, PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists } from "@/components/PlaylistsContext";
import { TrackActionsMenu } from "@/components/TrackActionsMenu";
import { TransitionChip } from "@/components/TransitionChip";

interface TrackRowProps {
  file: DriveFile;
  queue: DriveFile[];
  index: number;
  cachedTrack?: CachedTrack;
  source?: PlaySource;
  onRemove?: () => void;
  /** Wording for the remove action in the menu — what it removes from differs per list. */
  removeLabel?: string;
  /** The track that follows this one *in this list*, if any. Sorting and search make the list's
   * order and the queue's order two different things, so the caller says which one it means —
   * and what it means is where the transition chip below the row leads. */
  nextFile?: DriveFile;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrackRow({
  file,
  queue,
  index,
  cachedTrack,
  source,
  onRemove,
  removeLabel,
  nextFile,
}: TrackRowProps) {
  const { currentFile, isPlaying, isLoading, play, togglePlay } = usePlayer();
  const { isFavorite } = usePlaylists();
  const isCurrent = currentFile?.id === file.id;
  const favorited = isFavorite(file.id);
  const meta = cachedTrack?.parsedMeta;
  const title = meta?.title || file.name.replace(/\.[^./]+$/, "");
  const subtitle = [meta?.artist, meta?.album].filter(Boolean).join(" · ");

  const handleSelect = () => {
    if (isCurrent) togglePlay();
    else play(queue, index, source);
  };

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={handleSelect}
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-zinc-400 transition hover:opacity-80 dark:bg-zinc-800"
        >
          {meta?.pictureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.pictureDataUrl} alt="" className="h-full w-full object-cover" />
          ) : isCurrent && isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isCurrent && isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Music className="h-4 w-4" />
          )}
        </button>

        <button onClick={handleSelect} className="min-w-0 flex-1 text-left">
          <p
            className={clsx(
              "truncate text-sm",
              // The playing track is the one "active" thing in a list — same accent as every
              // other active state in the app.
              isCurrent ? "font-medium text-accent" : "text-zinc-700 dark:text-zinc-300",
            )}
          >
            {title}
          </p>
          {subtitle && <p className="truncate text-xs text-zinc-400">{subtitle}</p>}
        </button>

        <div className="flex shrink-0 items-center gap-2 text-zinc-400">
          {meta?.durationSec ? <span className="text-xs tabular-nums">{formatDuration(meta.durationSec)}</span> : null}
          {cachedTrack && <CloudCheck className="h-4 w-4 text-accent" />}
          {/* Favorited is worth showing at a glance, but as a plain indicator — toggling it (and
              every other per-track action) now lives in the menu, so the row keeps a single
              tappable surface: play. */}
          {favorited && <Heart className="h-4 w-4 fill-current text-red-500" aria-label="Favorite" />}
          <TrackActionsMenu file={file} onRemove={onRemove} removeLabel={removeLabel} />
        </div>
      </div>
      {/* Renders nothing unless mixing is on — see TransitionChip. */}
      {nextFile && <TransitionChip from={file} to={nextFile} />}
    </li>
  );
}

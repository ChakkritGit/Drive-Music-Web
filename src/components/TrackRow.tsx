"use client";

import { CloudCheck, Heart, ListEnd, Loader2, Music, Pause, Play, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { CachedTrack, DriveFile, PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists } from "@/components/PlaylistsContext";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";

interface TrackRowProps {
  file: DriveFile;
  queue: DriveFile[];
  index: number;
  cachedTrack?: CachedTrack;
  source?: PlaySource;
  onRemove?: () => void;
}

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrackRow({ file, queue, index, cachedTrack, source, onRemove }: TrackRowProps) {
  const { currentFile, isPlaying, isLoading, play, togglePlay, addToQueue } = usePlayer();
  const { isFavorite, toggleFavorite } = usePlaylists();
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
    <li className="flex items-center gap-3 py-3">
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
            isCurrent ? "font-medium text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-300",
          )}
        >
          {title}
        </p>
        {subtitle && <p className="truncate text-xs text-zinc-400">{subtitle}</p>}
      </button>

      <div className="flex shrink-0 items-center gap-2 text-zinc-400">
        {meta?.durationSec ? <span className="text-xs tabular-nums">{formatDuration(meta.durationSec)}</span> : null}
        {cachedTrack && <CloudCheck className="h-4 w-4 text-emerald-500" />}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(file);
          }}
          className={clsx(
            "rounded-full p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            favorited ? "text-red-500" : "text-zinc-400",
          )}
          aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={clsx("h-4 w-4", favorited && "fill-current")} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            addToQueue(file);
          }}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Add to queue"
        >
          <ListEnd className="h-4 w-4" />
        </button>
        <AddToPlaylistMenu file={file} />
        {isCurrent && !isLoading && (
          <button onClick={handleSelect} className="rounded-full p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
            aria-label="Remove from downloads"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

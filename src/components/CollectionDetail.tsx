"use client";

import { ArrowLeft, Play, Shuffle } from "lucide-react";
import type { DriveFile, PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { extractFeatures } from "@/lib/features";
import { predict, weightedRandomIndex } from "@/lib/model";

interface CollectionDetailProps {
  title: string;
  subtitle?: string;
  tracks: DriveFile[];
  source?: PlaySource;
  onBack: () => void;
}

/** A generic "preview and play" view for a track collection (a recommended mix, a recently-played
 * folder/playlist, ...) — shown when a Home card is opened, so the user can play in order, shuffle,
 * or pick a specific track themselves instead of immediately jumping into playback. */
export function CollectionDetail({ title, subtitle, tracks, source, onBack }: CollectionDetailProps) {
  const { cachedTracks, shuffle, toggleShuffle, play, model } = usePlayer();

  function handlePlayInOrder() {
    if (tracks.length === 0) return;
    if (shuffle) toggleShuffle();
    play(tracks, 0, source);
  }

  function handleShufflePlay() {
    if (tracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const now = new Date();
    const weights = tracks.map((f) => predict(model, extractFeatures(f, cachedTracks.get(f.id)?.parsedMeta, now)));
    play(tracks, weightedRandomIndex(weights), source);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h2 className="mb-1 text-lg font-medium text-zinc-900 dark:text-zinc-50">{title}</h2>
      <p className="mb-4 text-xs text-zinc-400">
        {subtitle ? `${subtitle} · ` : ""}
        {tracks.length} track{tracks.length === 1 ? "" : "s"}
      </p>

      {tracks.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handlePlayInOrder}
            className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white transition hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Play className="h-3.5 w-3.5" /> Play
          </button>
          <button
            onClick={handleShufflePlay}
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Shuffle className="h-3.5 w-3.5" /> Shuffle
          </button>
        </div>
      )}

      {tracks.length > 0 && <DownloadAllButton files={tracks} />}

      {tracks.length === 0 ? (
        <p className="py-10 text-sm text-zinc-400">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {tracks.map((file, i) => (
            <TrackRow
              key={`${file.id}-${i}`}
              file={file}
              queue={tracks}
              index={i}
              cachedTrack={cachedTracks.get(file.id)}
              source={source}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

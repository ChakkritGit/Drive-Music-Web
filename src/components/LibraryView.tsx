"use client";

import { Library, Shuffle } from "lucide-react";
import type { PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { extractFeatures } from "@/lib/features";
import { predict, weightedRandomIndex } from "@/lib/model";

const LIBRARY_SOURCE: PlaySource = { type: "library", id: "__library__", name: "Your Library" };

export function LibraryView() {
  const { cachedTracks, removeFromCache, shuffle, toggleShuffle, play, model } = usePlayer();
  const tracks = Array.from(cachedTracks.values()).sort((a, b) => b.cachedAt - a.cachedAt);
  const queue = tracks.map((t) => t.driveMeta);

  function handleShufflePlay() {
    if (queue.length === 0) return;
    if (!shuffle) toggleShuffle();
    const now = new Date();
    const weights = queue.map((f) => predict(model, extractFeatures(f, cachedTracks.get(f.id)?.parsedMeta, now)));
    play(queue, weightedRandomIndex(weights), LIBRARY_SOURCE);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          <Library className="h-4 w-4" /> Downloaded — available offline
        </h2>

        {tracks.length > 0 && (
          <button
            onClick={handleShufflePlay}
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <Shuffle className="h-3.5 w-3.5" /> Shuffle play
          </button>
        )}
      </div>

      {tracks.length === 0 ? (
        <p className="py-10 text-sm text-zinc-400">
          Nothing downloaded yet. Play a track from Browse and it will show up here for offline listening.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {tracks.map((t, i) => (
            <TrackRow
              key={t.fileId}
              file={t.driveMeta}
              cachedTrack={t}
              queue={queue}
              index={i}
              source={LIBRARY_SOURCE}
              onRemove={() => removeFromCache(t.fileId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

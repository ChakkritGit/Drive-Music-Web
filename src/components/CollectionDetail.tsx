"use client";

import { useState } from "react";
import { ChevronLeft, Play, Shuffle } from "lucide-react";
import { BACK, CoverArt, EmptyState, PAGE, PILL_OUTLINE, PILL_PRIMARY, PageHeader, SearchField } from "@/components/ui";
import type { DriveFile, PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { SequenceMixButton } from "@/components/SequenceMixButton";
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
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  // The queue passed to each row stays the full, unfiltered collection — searching only
  // changes what's displayed, not what plays next/prev, so up-next isn't scoped to the search.
  const visibleTracks = tracks
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => {
      if (!normalizedQuery) return true;
      const meta = cachedTracks.get(file.id)?.parsedMeta;
      const haystack = [file.name, meta?.title, meta?.artist, meta?.album].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });

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

  const covers = tracks
    .map((f) => cachedTracks.get(f.id)?.parsedMeta.pictureDataUrl)
    .filter((c): c is string => !!c)
    .slice(0, 4);

  return (
    <div className={PAGE}>
      <button onClick={onBack} className={BACK}>
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <PageHeader
        eyebrow={subtitle}
        title={title}
        meta={`${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
        cover={<CoverArt covers={covers} />}
        actions={
          tracks.length > 0 && (
            <>
              <button onClick={handlePlayInOrder} className={PILL_PRIMARY}>
                <Play className="h-4 w-4 fill-current" /> Play
              </button>
              <button onClick={handleShufflePlay} className={PILL_OUTLINE}>
                <Shuffle className="h-4 w-4" /> Shuffle
              </button>
              <SequenceMixButton files={tracks} source={source} />
            </>
          )
        }
      />

      {tracks.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SearchField value={query} onChange={setQuery} placeholder="Search this collection" className="sm:w-80" />
          <DownloadAllButton files={tracks} />
        </div>
      )}

      {tracks.length === 0 ? (
        <EmptyState>Nothing here yet.</EmptyState>
      ) : visibleTracks.length === 0 ? (
        <EmptyState>No tracks match &quot;{query}&quot;.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {visibleTracks.map(({ file, index }, position) => (
            <TrackRow
              key={`${file.id}-${index}`}
              file={file}
              queue={tracks}
              index={index}
              nextFile={visibleTracks[position + 1]?.file}
              cachedTrack={cachedTracks.get(file.id)}
              source={source}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

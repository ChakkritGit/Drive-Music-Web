"use client";

import { useState } from "react";
import { ChevronLeft, Play } from "lucide-react";
import { BACK, CoverArt, EmptyState, PAGE, PILL_PRIMARY, PageHeader, SearchField } from "@/components/ui";
import type { Playlist } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists } from "@/components/PlaylistsContext";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { SequenceMixButton } from "@/components/SequenceMixButton";

export function PlaylistDetail({ playlist, onBack }: { playlist: Playlist; onBack: () => void }) {
  const { cachedTracks, play } = usePlayer();
  const { removeTrackFromPlaylist } = usePlaylists();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  // The queue passed to each row stays the full, unfiltered playlist — searching only changes
  // what's displayed, not what plays next/prev, so up-next isn't scoped to the search text.
  const visibleTracks = playlist.tracks
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => {
      if (!normalizedQuery) return true;
      const meta = cachedTracks.get(file.id)?.parsedMeta;
      const haystack = [file.name, meta?.title, meta?.artist, meta?.album].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });

  const source = { type: "playlist" as const, id: playlist.id, name: playlist.name };
  const covers = playlist.tracks
    .map((f) => cachedTracks.get(f.id)?.parsedMeta.pictureDataUrl)
    .filter((c): c is string => !!c)
    .slice(0, 4);

  return (
    <div className={PAGE}>
      <button onClick={onBack} className={BACK}>
        <ChevronLeft className="h-4 w-4" /> Playlists
      </button>

      <PageHeader
        eyebrow="Playlist"
        title={playlist.name}
        meta={`${playlist.tracks.length} track${playlist.tracks.length === 1 ? "" : "s"}`}
        cover={<CoverArt covers={covers} />}
        actions={
          playlist.tracks.length > 0 && (
            <>
              <button onClick={() => play(playlist.tracks, 0, source)} className={PILL_PRIMARY}>
                <Play className="h-4 w-4 fill-current" /> Play
              </button>
              <SequenceMixButton files={playlist.tracks} source={source} />
            </>
          )
        }
      />

      {playlist.tracks.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SearchField value={query} onChange={setQuery} placeholder="Search this playlist" className="sm:w-80" />
          <DownloadAllButton files={playlist.tracks} />
        </div>
      )}

      {playlist.tracks.length === 0 ? (
        <EmptyState>This playlist is empty. Add tracks from Browse with a track&apos;s menu.</EmptyState>
      ) : visibleTracks.length === 0 ? (
        <EmptyState>No tracks match &quot;{query}&quot;.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {visibleTracks.map(({ file, index }, position) => (
            <TrackRow
              key={`${file.id}-${index}`}
              file={file}
              queue={playlist.tracks}
              index={index}
              nextFile={visibleTracks[position + 1]?.file}
              cachedTrack={cachedTracks.get(file.id)}
              source={source}
              onRemove={() => removeTrackFromPlaylist(playlist.id, file.id)}
              removeLabel="Remove from playlist"
            />
          ))}
        </ul>
      )}
    </div>
  );
}

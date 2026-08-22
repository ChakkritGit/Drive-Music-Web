"use client";

import { useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import type { Playlist } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists } from "@/components/PlaylistsContext";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { SequenceMixButton } from "@/components/SequenceMixButton";

export function PlaylistDetail({ playlist, onBack }: { playlist: Playlist; onBack: () => void }) {
  const { cachedTracks } = usePlayer();
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
      >
        <ArrowLeft className="h-4 w-4" /> Playlists
      </button>

      <h2 className="mb-1 text-lg font-medium text-zinc-900 dark:text-zinc-50">{playlist.name}</h2>
      <p className="mb-4 text-xs text-zinc-400">
        {playlist.tracks.length} track{playlist.tracks.length === 1 ? "" : "s"}
      </p>

      {playlist.tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <DownloadAllButton files={playlist.tracks} />
          <SequenceMixButton
            files={playlist.tracks}
            source={{ type: "playlist", id: playlist.id, name: playlist.name }}
            className="mb-4"
          />
        </div>
      )}

      {playlist.tracks.length > 0 && (
        <div className="relative mt-4 mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this playlist…"
            className="w-full rounded-full border border-zinc-200 bg-transparent py-2 pr-4 pl-9 text-sm text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300"
          />
        </div>
      )}

      {playlist.tracks.length === 0 ? (
        <p className="py-10 text-sm text-zinc-400">
          This playlist is empty. Add tracks to it from Browse using the &quot;+&quot; button on a track.
        </p>
      ) : visibleTracks.length === 0 ? (
        <p className="py-10 text-sm text-zinc-400">No tracks match &quot;{query}&quot;.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {visibleTracks.map(({ file, index }, position) => (
            <TrackRow
              key={`${file.id}-${index}`}
              file={file}
              queue={playlist.tracks}
              index={index}
              nextFile={visibleTracks[position + 1]?.file}
              cachedTrack={cachedTracks.get(file.id)}
              source={{ type: "playlist", id: playlist.id, name: playlist.name }}
              onRemove={() => removeTrackFromPlaylist(playlist.id, file.id)}
              removeLabel="Remove from playlist"
            />
          ))}
        </ul>
      )}
    </div>
  );
}

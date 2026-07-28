"use client";

import { ArrowLeft } from "lucide-react";
import type { Playlist } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists } from "@/components/PlaylistsContext";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";

export function PlaylistDetail({ playlist, onBack }: { playlist: Playlist; onBack: () => void }) {
  const { cachedTracks } = usePlayer();
  const { removeTrackFromPlaylist } = usePlaylists();

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

      {playlist.tracks.length > 0 && <DownloadAllButton files={playlist.tracks} />}

      {playlist.tracks.length === 0 ? (
        <p className="py-10 text-sm text-zinc-400">
          This playlist is empty. Add tracks to it from Browse using the &quot;+&quot; button on a track.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {playlist.tracks.map((file, i) => (
            <TrackRow
              key={`${file.id}-${i}`}
              file={file}
              queue={playlist.tracks}
              index={i}
              cachedTrack={cachedTracks.get(file.id)}
              source={{ type: "playlist", id: playlist.id, name: playlist.name }}
              onRemove={() => removeTrackFromPlaylist(playlist.id, file.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

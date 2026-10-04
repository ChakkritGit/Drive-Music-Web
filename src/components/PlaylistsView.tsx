"use client";

import { useState } from "react";
import { Heart, ListMusic, Plus, Trash2 } from "lucide-react";
import { usePlayer } from "@/components/PlayerContext";
import { FAVORITES_PLAYLIST_NAME, usePlaylists } from "@/components/PlaylistsContext";
import { MediaCard } from "@/components/MediaCard";
import { EmptyState, PAGE, PILL_PRIMARY, PageHeader } from "@/components/ui";
import type { Playlist } from "@/types";

export function PlaylistsView({ onOpen }: { onOpen: (playlist: Playlist) => void }) {
  const { playlists, createPlaylist, deletePlaylist } = usePlaylists();
  const { cachedTracks, play } = usePlayer();
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    await createPlaylist(name);
  };

  const coversFor = (p: Playlist) =>
    p.tracks
      .map((f) => cachedTracks.get(f.id)?.parsedMeta.pictureDataUrl)
      .filter((c): c is string => !!c)
      .slice(0, 4);

  return (
    <div className={PAGE}>
      <PageHeader title="Playlists" meta={`${playlists.length} playlist${playlists.length === 1 ? "" : "s"}`} />

      <form
        className="mb-8 flex max-w-md items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New playlist name"
          aria-label="New playlist name"
          className="h-10 min-w-0 flex-1 rounded-full bg-zinc-100 px-4 text-sm text-zinc-950 outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-accent/50 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button type="submit" disabled={!newName.trim()} className={PILL_PRIMARY}>
          <Plus className="h-4 w-4" /> Create
        </button>
      </form>

      {playlists.length === 0 ? (
        <EmptyState icon={<ListMusic className="h-6 w-6" />}>
          No playlists yet. Name one above, or add a track to a new playlist from its menu.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {playlists.map((p) => {
            const favorites = p.name === FAVORITES_PLAYLIST_NAME;
            return (
              <div key={p.id} className="group/card relative">
                <MediaCard
                  title={p.name}
                  subtitle={`${p.tracks.length} track${p.tracks.length === 1 ? "" : "s"}`}
                  covers={coversFor(p)}
                  icon={favorites ? <Heart className="h-8 w-8" /> : undefined}
                  onOpen={() => onOpen(p)}
                  onPlay={p.tracks.length > 0 ? () => play(p.tracks, 0, { type: "playlist", id: p.id, name: p.name }) : undefined}
                />
                <button
                  onClick={() => deletePlaylist(p.id)}
                  aria-label={`Delete playlist ${p.name}`}
                  className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-zinc-600 opacity-0 shadow transition group-focus-within/card:opacity-100 group-hover/card:opacity-100 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:bg-zinc-900/90 dark:text-zinc-300 [@media(hover:none)]:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

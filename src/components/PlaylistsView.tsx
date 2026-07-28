"use client";

import { useState } from "react";
import { ListMusic, Plus, Trash2 } from "lucide-react";
import { usePlaylists } from "@/components/PlaylistsContext";
import type { Playlist } from "@/types";

export function PlaylistsView({ onOpen }: { onOpen: (playlist: Playlist) => void }) {
  const { playlists, createPlaylist, deletePlaylist } = usePlaylists();
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    await createPlaylist(name);
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        <ListMusic className="h-4 w-4" /> Playlists
      </h2>

      <div className="mb-6 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New playlist name…"
          className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-transparent px-4 py-2 text-sm text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300"
        />
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white transition hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>

      {playlists.length === 0 ? (
        <p className="py-10 text-sm text-zinc-400">
          No playlists yet. Create one above, or add a track to a new playlist from Browse.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {playlists.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <button onClick={() => onOpen(p)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{p.name}</p>
                <p className="text-xs text-zinc-400">
                  {p.tracks.length} track{p.tracks.length === 1 ? "" : "s"}
                </p>
              </button>
              <button
                onClick={() => deletePlaylist(p.id)}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                aria-label="Delete playlist"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

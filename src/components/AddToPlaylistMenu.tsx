"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ListPlus, Plus } from "lucide-react";
import { usePlaylists } from "@/components/PlaylistsContext";
import type { DriveFile } from "@/types";

export function AddToPlaylistMenu({ file }: { file: DriveFile }) {
  const { playlists, createPlaylist, addTrackToPlaylist, removeTrackFromPlaylist } = usePlaylists();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const playlist = await createPlaylist(name);
    await addTrackToPlaylist(playlist.id, file);
    setNewName("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Add to playlist"
      >
        <ListPlus className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {playlists.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-zinc-400">No playlists yet</p>
          ) : (
            <ul className="max-h-40 overflow-y-auto">
              {playlists.map((p) => {
                const inPlaylist = p.tracks.some((t) => t.id === file.id);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() =>
                        inPlaylist ? removeTrackFromPlaylist(p.id, file.id) : addTrackToPlaylist(p.id, file)
                      }
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <span className="truncate">{p.name}</span>
                      {inPlaylist && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-2 flex items-center gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="New playlist…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-xs text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300"
            />
            <button
              onClick={handleCreate}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Create playlist"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

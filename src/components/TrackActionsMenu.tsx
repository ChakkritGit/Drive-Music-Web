"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  Heart,
  ListEnd,
  ListPlus,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists } from "@/components/PlaylistsContext";
import type { DriveFile } from "@/types";

// Every per-track action lives behind this one button. They used to sit in the row as three or
// four separate icons, which on a phone left almost no room for the title and made the whole
// row a minefield of tap targets right next to "play this track".
export function TrackActionsMenu({
  file,
  onRemove,
  removeLabel = "Remove",
}: {
  file: DriveFile;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const { addToQueue } = usePlayer();
  const { playlists, createPlaylist, addTrackToPlaylist, removeTrackFromPlaylist, isFavorite, toggleFavorite } =
    usePlaylists();
  const [open, setOpen] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const favorited = isFavorite(file.id);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Rows near the bottom of a long list would otherwise open a menu that runs off-screen, with
  // the page unable to scroll to it (the lists live in their own overflow container). Measured
  // in a layout effect so the flipped position is in place before the menu is ever painted.
  useLayoutEffect(() => {
    if (!open) return;
    const button = containerRef.current?.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? 0;
    if (button) setDropUp(button.bottom + height > window.innerHeight);
  }, [open, showPlaylists]);

  function close() {
    setOpen(false);
    setShowPlaylists(false);
  }

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
          setShowPlaylists(false);
        }}
        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Track actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={clsx(
            "absolute right-0 z-20 w-56 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {showPlaylists ? (
            <>
              <p className="px-2 py-1.5 text-xs font-medium text-zinc-400">Add to playlist</p>
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
                            inPlaylist
                              ? removeTrackFromPlaylist(p.id, file.id)
                              : addTrackToPlaylist(p.id, file)
                          }
                          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          <span className="truncate">{p.name}</span>
                          {inPlaylist && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-1.5 flex items-center gap-1 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
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
            </>
          ) : (
            <ul>
              <li>
                <MenuItem
                  icon={
                    <Heart className={clsx("h-4 w-4", favorited && "fill-current text-red-500")} />
                  }
                  label={favorited ? "Remove from favorites" : "Add to favorites"}
                  onClick={() => {
                    toggleFavorite(file);
                    close();
                  }}
                />
              </li>
              <li>
                <MenuItem
                  icon={<ListEnd className="h-4 w-4" />}
                  label="Play next"
                  onClick={() => {
                    addToQueue(file);
                    close();
                  }}
                />
              </li>
              <li>
                <MenuItem
                  icon={<ListPlus className="h-4 w-4" />}
                  label="Add to playlist…"
                  // Stays open: picking playlists is a multi-select, and creating one from here
                  // needs the text field to survive the click.
                  onClick={() => setShowPlaylists(true)}
                />
              </li>
              {onRemove && (
                <li className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
                  <MenuItem
                    icon={<Trash2 className="h-4 w-4" />}
                    label={removeLabel}
                    destructive
                    onClick={() => {
                      onRemove();
                      close();
                    }}
                  />
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
        destructive
          ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800",
      )}
    >
      <span className={clsx("shrink-0", !destructive && "text-zinc-400")}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

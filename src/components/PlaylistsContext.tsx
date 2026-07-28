"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DriveFile, Playlist } from "@/types";
import {
  addTrackToPlaylist as dbAddTrackToPlaylist,
  createPlaylist as dbCreatePlaylist,
  deletePlaylist as dbDeletePlaylist,
  removeTrackFromPlaylist as dbRemoveTrackFromPlaylist,
  renamePlaylist as dbRenamePlaylist,
  listPlaylists,
} from "@/lib/db";

/** Favoriting a track is just adding it to this lazily-created, ordinary playlist — no separate storage. */
export const FAVORITES_PLAYLIST_NAME = "Favorites";

interface PlaylistsContextValue {
  playlists: Playlist[];
  createPlaylist: (name: string) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  addTrackToPlaylist: (id: string, file: DriveFile) => Promise<void>;
  removeTrackFromPlaylist: (id: string, fileId: string) => Promise<void>;
  isFavorite: (fileId: string) => boolean;
  toggleFavorite: (file: DriveFile) => Promise<void>;
}

const PlaylistsContext = createContext<PlaylistsContextValue | null>(null);

export function usePlaylists(): PlaylistsContextValue {
  const ctx = useContext(PlaylistsContext);
  if (!ctx) throw new Error("usePlaylists must be used within a PlaylistsProvider");
  return ctx;
}

export function PlaylistsProvider({ children }: { children: React.ReactNode }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const refresh = useCallback(async () => {
    setPlaylists(await listPlaylists());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seed playlist index from IndexedDB on mount
    refresh();
  }, [refresh]);

  const createPlaylist = useCallback(
    async (name: string) => {
      const playlist = await dbCreatePlaylist(name);
      await refresh();
      return playlist;
    },
    [refresh],
  );

  const deletePlaylist = useCallback(
    async (id: string) => {
      await dbDeletePlaylist(id);
      await refresh();
    },
    [refresh],
  );

  const renamePlaylist = useCallback(
    async (id: string, name: string) => {
      await dbRenamePlaylist(id, name);
      await refresh();
    },
    [refresh],
  );

  const addTrackToPlaylist = useCallback(
    async (id: string, file: DriveFile) => {
      await dbAddTrackToPlaylist(id, file);
      await refresh();
    },
    [refresh],
  );

  const removeTrackFromPlaylist = useCallback(
    async (id: string, fileId: string) => {
      await dbRemoveTrackFromPlaylist(id, fileId);
      await refresh();
    },
    [refresh],
  );

  const favoritesPlaylist = playlists.find((p) => p.name === FAVORITES_PLAYLIST_NAME);

  const isFavorite = useCallback(
    (fileId: string) => (favoritesPlaylist ? favoritesPlaylist.tracks.some((t) => t.id === fileId) : false),
    [favoritesPlaylist],
  );

  const toggleFavorite = useCallback(
    async (file: DriveFile) => {
      const playlist = favoritesPlaylist ?? (await dbCreatePlaylist(FAVORITES_PLAYLIST_NAME));
      if (playlist.tracks.some((t) => t.id === file.id)) {
        await dbRemoveTrackFromPlaylist(playlist.id, file.id);
      } else {
        await dbAddTrackToPlaylist(playlist.id, file);
      }
      await refresh();
    },
    [favoritesPlaylist, refresh],
  );

  const value = useMemo<PlaylistsContextValue>(
    () => ({
      playlists,
      createPlaylist,
      deletePlaylist,
      renamePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      isFavorite,
      toggleFavorite,
    }),
    [
      playlists,
      createPlaylist,
      deletePlaylist,
      renamePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      isFavorite,
      toggleFavorite,
    ],
  );

  return <PlaylistsContext.Provider value={value}>{children}</PlaylistsContext.Provider>;
}

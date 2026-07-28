import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  CachedTrack,
  DriveFile,
  ListeningModel,
  ModelEvent,
  PlaybackSession,
  Playlist,
  RecentSource,
} from "@/types";
import { createDefaultModel } from "@/lib/model";

const DB_NAME = "drive-music";
const DB_VERSION = 7;
const TRACKS_STORE = "tracks";
const PLAYLISTS_STORE = "playlists";
const RECENT_SOURCES_STORE = "recentSources";
const MODEL_STORE = "model";
const MODEL_EVENTS_STORE = "modelEvents";
const PLAYBACK_SESSION_STORE = "playbackSession";
const MAX_MODEL_EVENTS = 500;

interface DriveMusicDB extends DBSchema {
  tracks: {
    key: string;
    value: CachedTrack;
  };
  playlists: {
    key: string;
    value: Playlist;
  };
  recentSources: {
    key: string;
    value: RecentSource;
  };
  model: {
    key: string;
    value: ListeningModel;
  };
  modelEvents: {
    key: string;
    value: ModelEvent;
  };
  playbackSession: {
    key: string;
    value: PlaybackSession;
  };
}

let dbPromise: Promise<IDBPDatabase<DriveMusicDB>> | undefined;

function getDb(): Promise<IDBPDatabase<DriveMusicDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DriveMusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(TRACKS_STORE)) {
          db.createObjectStore(TRACKS_STORE, { keyPath: "fileId" });
        }
        if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
          db.createObjectStore(PLAYLISTS_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(RECENT_SOURCES_STORE)) {
          db.createObjectStore(RECENT_SOURCES_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(MODEL_STORE)) {
          db.createObjectStore(MODEL_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(MODEL_EVENTS_STORE)) {
          db.createObjectStore(MODEL_EVENTS_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PLAYBACK_SESSION_STORE)) {
          db.createObjectStore(PLAYBACK_SESSION_STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedTrack(
  fileId: string,
): Promise<CachedTrack | undefined> {
  const db = await getDb();
  return db.get(TRACKS_STORE, fileId);
}

export async function putCachedTrack(track: CachedTrack): Promise<void> {
  const db = await getDb();
  await db.put(TRACKS_STORE, track);
}

export async function deleteCachedTrack(fileId: string): Promise<void> {
  const db = await getDb();
  await db.delete(TRACKS_STORE, fileId);
}

export async function listCachedTracks(): Promise<CachedTrack[]> {
  const db = await getDb();
  const all = await db.getAll(TRACKS_STORE);
  return all.sort((a, b) => b.cachedAt - a.cachedAt);
}

export async function isTrackCached(fileId: string): Promise<boolean> {
  const db = await getDb();
  const key = await db.getKey(TRACKS_STORE, fileId);
  return key !== undefined;
}

export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  const all = await db.getAll(PLAYLISTS_STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const db = await getDb();
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name,
    tracks: [],
    createdAt: Date.now(),
  };
  await db.put(PLAYLISTS_STORE, playlist);
  return playlist;
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(PLAYLISTS_STORE, id);
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const db = await getDb();
  const playlist = await db.get(PLAYLISTS_STORE, id);
  if (!playlist) return;
  await db.put(PLAYLISTS_STORE, { ...playlist, name });
}

export async function addTrackToPlaylist(
  id: string,
  file: DriveFile,
): Promise<void> {
  const db = await getDb();
  const playlist = await db.get(PLAYLISTS_STORE, id);
  if (!playlist) return;
  if (playlist.tracks.some((t) => t.id === file.id)) return;
  await db.put(PLAYLISTS_STORE, {
    ...playlist,
    tracks: [...playlist.tracks, file],
  });
}

export async function removeTrackFromPlaylist(
  id: string,
  fileId: string,
): Promise<void> {
  const db = await getDb();
  const playlist = await db.get(PLAYLISTS_STORE, id);
  if (!playlist) return;
  await db.put(PLAYLISTS_STORE, {
    ...playlist,
    tracks: playlist.tracks.filter((t) => t.id !== fileId),
  });
}

export async function recordRecentSource(
  source: Omit<RecentSource, "playCount">,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(RECENT_SOURCES_STORE, source.id);
  await db.put(RECENT_SOURCES_STORE, {
    ...source,
    playCount: (existing?.playCount ?? 0) + 1,
  });
}

export async function listRecentSources(limit = 12): Promise<RecentSource[]> {
  const db = await getDb();
  const all = await db.getAll(RECENT_SOURCES_STORE);
  return all.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, limit);
}

export async function loadModel(): Promise<ListeningModel> {
  const db = await getDb();
  const existing = await db.get(MODEL_STORE, "default");
  // Guards against a model saved by an older architecture (e.g. the earlier flat-weights
  // logistic regression) — start fresh rather than crash on a shape mismatch.
  if (!existing || !Array.isArray(existing.w1)) {
    return createDefaultModel();
  }
  return existing;
}

export async function saveModel(model: ListeningModel): Promise<void> {
  const db = await getDb();
  await db.put(MODEL_STORE, model);
}

export async function recordModelEvent(event: ModelEvent): Promise<void> {
  const db = await getDb();
  await db.put(MODEL_EVENTS_STORE, event);

  const count = await db.count(MODEL_EVENTS_STORE);
  if (count > MAX_MODEL_EVENTS) {
    const all = await db.getAll(MODEL_EVENTS_STORE);
    const oldest = all
      .sort((a, b) => a.at - b.at)
      .slice(0, count - MAX_MODEL_EVENTS);
    await Promise.all(oldest.map((e) => db.delete(MODEL_EVENTS_STORE, e.id)));
  }
}

export async function listModelEvents(limit = 100): Promise<ModelEvent[]> {
  const db = await getDb();
  const all = await db.getAll(MODEL_EVENTS_STORE);
  return all.sort((a, b) => b.at - a.at).slice(0, limit);
}

export async function loadPlaybackSession(): Promise<PlaybackSession | null> {
  const db = await getDb();
  const existing = await db.get(PLAYBACK_SESSION_STORE, "default");
  return existing ?? null;
}

export async function savePlaybackSession(
  session: PlaybackSession,
): Promise<void> {
  const db = await getDb();
  await db.put(PLAYBACK_SESSION_STORE, session);
}

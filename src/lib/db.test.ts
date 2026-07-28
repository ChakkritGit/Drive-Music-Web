import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  addTrackToPlaylist,
  createPlaylist,
  deleteCachedTrack,
  deletePlaylist,
  getCachedTrack,
  isTrackCached,
  listCachedTracks,
  listModelEvents,
  listPlaylists,
  listRecentSources,
  loadModel,
  putCachedTrack,
  recordModelEvent,
  recordRecentSource,
  removeTrackFromPlaylist,
  renamePlaylist,
  saveModel,
} from "@/lib/db";
import { createDefaultModel } from "@/lib/model";
import type { CachedTrack, DriveFile, ParsedMetadata } from "@/types";

function file(id: string): DriveFile {
  return { id, name: `${id}.mp3`, mimeType: "audio/mpeg" };
}

function meta(): ParsedMetadata {
  return { title: "A Song" };
}

describe("tracks store", () => {
  it("round-trips a cached track and reports it as cached", async () => {
    const track: CachedTrack = {
      fileId: "t1",
      blob: new Blob(["hello"], { type: "audio/mpeg" }),
      mimeType: "audio/mpeg",
      driveMeta: file("t1"),
      parsedMeta: meta(),
      cachedAt: Date.now(),
    };
    expect(await isTrackCached("t1")).toBe(false);
    await putCachedTrack(track);
    expect(await isTrackCached("t1")).toBe(true);
    const fetched = await getCachedTrack("t1");
    expect(fetched?.fileId).toBe("t1");
    expect(fetched?.parsedMeta.title).toBe("A Song");
  });

  it("lists cached tracks sorted by most-recently cached first", async () => {
    const older: CachedTrack = {
      fileId: "sort-old",
      blob: new Blob(["a"]),
      mimeType: "audio/mpeg",
      driveMeta: file("sort-old"),
      parsedMeta: {},
      cachedAt: 1000,
    };
    const newer: CachedTrack = {
      fileId: "sort-new",
      blob: new Blob(["b"]),
      mimeType: "audio/mpeg",
      driveMeta: file("sort-new"),
      parsedMeta: {},
      cachedAt: 2000,
    };
    await putCachedTrack(older);
    await putCachedTrack(newer);
    const all = await listCachedTracks();
    const oldIdx = all.findIndex((t) => t.fileId === "sort-old");
    const newIdx = all.findIndex((t) => t.fileId === "sort-new");
    expect(newIdx).toBeLessThan(oldIdx);
  });

  it("deletes a cached track", async () => {
    await putCachedTrack({
      fileId: "to-delete",
      blob: new Blob(["x"]),
      mimeType: "audio/mpeg",
      driveMeta: file("to-delete"),
      parsedMeta: {},
      cachedAt: Date.now(),
    });
    expect(await isTrackCached("to-delete")).toBe(true);
    await deleteCachedTrack("to-delete");
    expect(await isTrackCached("to-delete")).toBe(false);
  });
});

describe("playlists store", () => {
  it("creates a playlist and finds it via listPlaylists", async () => {
    const playlist = await createPlaylist("Road Trip");
    expect(playlist.tracks).toEqual([]);
    const all = await listPlaylists();
    const found = all.find((p) => p.id === playlist.id);
    expect(found?.name).toBe("Road Trip");
  });

  it("adds and removes tracks, de-duplicating on add", async () => {
    const playlist = await createPlaylist("Chill");
    await addTrackToPlaylist(playlist.id, file("song-1"));
    await addTrackToPlaylist(playlist.id, file("song-1")); // duplicate add should be a no-op
    let all = await listPlaylists();
    let found = all.find((p) => p.id === playlist.id);
    expect(found?.tracks.map((t) => t.id)).toEqual(["song-1"]);

    await removeTrackFromPlaylist(playlist.id, "song-1");
    all = await listPlaylists();
    found = all.find((p) => p.id === playlist.id);
    expect(found?.tracks).toEqual([]);
  });

  it("renames a playlist", async () => {
    const playlist = await createPlaylist("Old Name");
    await renamePlaylist(playlist.id, "New Name");
    const all = await listPlaylists();
    expect(all.find((p) => p.id === playlist.id)?.name).toBe("New Name");
  });

  it("deletes a playlist", async () => {
    const playlist = await createPlaylist("Temporary");
    await deletePlaylist(playlist.id);
    const all = await listPlaylists();
    expect(all.find((p) => p.id === playlist.id)).toBeUndefined();
  });
});

describe("recentSources store", () => {
  it("upserts a recent source and lists it back", async () => {
    await recordRecentSource({
      type: "folder",
      id: "folder-1",
      name: "My Folder",
      tracks: [file("a")],
      lastPlayedAt: Date.now(),
    });
    const all = await listRecentSources(50);
    expect(all.find((s) => s.id === "folder-1")?.name).toBe("My Folder");
  });

  it("re-recording the same id updates it in place rather than duplicating", async () => {
    await recordRecentSource({
      type: "playlist",
      id: "same-id",
      name: "First",
      tracks: [],
      lastPlayedAt: 1,
    });
    await recordRecentSource({
      type: "playlist",
      id: "same-id",
      name: "Second",
      tracks: [],
      lastPlayedAt: 2,
    });
    const all = await listRecentSources(50);
    const matches = all.filter((s) => s.id === "same-id");
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe("Second");
  });

  it("increments playCount each time the same source is recorded again", async () => {
    await recordRecentSource({
      type: "folder",
      id: "counted",
      name: "Counted Folder",
      tracks: [],
      lastPlayedAt: 1,
    });
    await recordRecentSource({
      type: "folder",
      id: "counted",
      name: "Counted Folder",
      tracks: [],
      lastPlayedAt: 2,
    });
    await recordRecentSource({
      type: "folder",
      id: "counted",
      name: "Counted Folder",
      tracks: [],
      lastPlayedAt: 3,
    });
    const all = await listRecentSources(50);
    expect(all.find((s) => s.id === "counted")?.playCount).toBe(3);
  });
});

describe("model store", () => {
  it("loadModel returns a usable default model when nothing has been saved", async () => {
    const model = await loadModel();
    expect(model.id).toBe("default");
    expect(Array.isArray(model.w1)).toBe(true);
  });

  it("round-trips a saved model", async () => {
    const model = createDefaultModel();
    model.trainingEvents = 42;
    await saveModel(model);
    const loaded = await loadModel();
    expect(loaded.trainingEvents).toBe(42);
  });

  it("discards an incompatible (old-architecture) saved model rather than crashing", async () => {
    // Simulate the earlier flat-weights logistic-regression shape by saving something
    // that lacks `w1` — loadModel should not blow up on it, and should fall back cleanly.
    await saveModel({ id: "default", weights: [1, 2, 3] } as never);
    const loaded = await loadModel();
    expect(Array.isArray(loaded.w1)).toBe(true);
    expect(loaded.trainingEvents).toBe(0);
  });
});

describe("modelEvents store", () => {
  it("records an event and lists it back, most recent first", async () => {
    await recordModelEvent({
      id: "e1",
      trackId: "t1",
      title: "Song A",
      fraction: 0.9,
      predicted: 0.5,
      at: 1000,
    });
    await recordModelEvent({
      id: "e2",
      trackId: "t2",
      title: "Song B",
      fraction: 0.2,
      predicted: 0.4,
      at: 2000,
    });
    const events = await listModelEvents(10);
    expect(events[0].id).toBe("e2");
    expect(events[1].id).toBe("e1");
  });

  it("prunes the oldest events once the store exceeds 500 rows", async () => {
    for (let i = 0; i < 520; i++) {
      await recordModelEvent({
        id: `bulk-${i}`,
        trackId: "t",
        title: "Bulk",
        fraction: 0.5,
        predicted: 0.5,
        at: i,
      });
    }
    const events = await listModelEvents(1000);
    // 520 bulk events + the 2 recorded in the previous test = 522 inserted total against
    // this same store; the store must never exceed the 500-row cap.
    expect(events.length).toBeLessThanOrEqual(500);
    // And it should have pruned the oldest (lowest `at`) ones, keeping the newest.
    const ids = new Set(events.map((e) => e.id));
    expect(ids.has("bulk-519")).toBe(true);
    expect(ids.has("bulk-0")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPauseLog, recordPause, type PauseEntry } from "@/lib/pauseLog";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

const entry = (at: number): PauseEntry => ({ at, position: 12, source: "browser", hidden: true, audio: "running" });

describe("pause log", () => {
  beforeEach(() => store.clear());

  it("keeps the newest first", () => {
    recordPause(entry(1));
    recordPause(entry(2));
    expect(readPauseLog().map((e) => e.at)).toEqual([2, 1]);
  });

  it("keeps at most 30", () => {
    for (let i = 0; i < 35; i++) recordPause(entry(i));
    const log = readPauseLog();
    expect(log).toHaveLength(30);
    expect(log[0].at).toBe(34);
  });

  it("survives garbage in storage", () => {
    store.set("drive-music-pause-log", "{not json");
    expect(readPauseLog()).toEqual([]);
    store.set("drive-music-pause-log", '{"a":1}');
    expect(readPauseLog()).toEqual([]);
  });
});

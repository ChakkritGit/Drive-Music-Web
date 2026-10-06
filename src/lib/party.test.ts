import { describe, expect, it } from "vitest";
import { reducePlayback, upcoming, validCommand, validPlayback, positionAt, type PartyPlayback } from "./party";
import { canViewAnalytics } from "./admin";
const files = ["a", "b", "c", "d"].map(id => ({ id, name: id, mimeType: "audio/mpeg" }));
function state(): PartyPlayback { return reducePlayback(null, { type: "play", queue: files, index: 1 }, 1000)!; }
describe("shared playback", () => {
  it("advances the queue and refreshes upcoming tracks on next/previous", () => {
    const next = reducePlayback(state(), { type: "next" }, 1100)!;
    expect(next.currentIndex).toBe(2);
    expect(upcoming(next)).toEqual([3]);
    expect(reducePlayback(next, { type: "previous" }, 1100)?.currentIndex).toBe(1);
  });
  it("inserts an earlier track next without changing the current track", () => {
    const p = reducePlayback(state(), { type: "insert", file: files[0] }, 1100)!;
    expect(p.queue.map(f => f.id)).toEqual(["b", "a", "c", "d"]);
    expect(p.currentIndex).toBe(0);
    expect(upcoming(p).map(i => p.queue[i].id)).toEqual(["a", "c", "d"]);
    expect(reducePlayback(p, { type: "next" }, 1100)?.currentIndex).toBe(1);
  });
  it("retains shuffle order after play next and removal", () => {
    let p = { ...state(), shuffle: true, shuffleOrder: [1, 3, 0, 2] };
    p = reducePlayback(p, { type: "insert", file: files[2] }, 1100)!;
    expect(upcoming(p).map(i => p.queue[i].id)).toEqual(["c", "d", "a"]);
    p = reducePlayback(p, { type: "remove", index: 2, fileId: "c" }, 1100)!;
    expect(upcoming(p).map(i => p.queue[i].id)).toEqual(["d", "a"]);
    expect(p.playNextIndex).toBeNull();
  });
  it("does not remove a different file using a stale queue index", () => {
    const p = state();
    expect(reducePlayback(p, { type: "remove", index: 2, fileId: "d" }, 1100)).toBe(p);
    expect(reducePlayback(p, { type: "remove", index: 1, fileId: "b" }, 1100)).toBe(p);
  });
  it("reduces consecutive commands against the latest queue", () => {
    const p = reducePlayback(reducePlayback(state(), { type: "insert", file: files[3] }, 1100), { type: "insert", file: files[0] }, 1200)!;
    expect(p.queue.map(f => f.id)).toEqual(["b", "a", "d", "c"]);
    expect(p.queue[p.currentIndex].id).toBe("b");
  });
  it("keeps pause position stable and clamps seeks", () => {
    let p = { ...state(), duration: 100, progress: 20 };
    p = reducePlayback(p, { type: "toggle" }, 3000)!;
    expect(p.progress).toBe(22);
    expect(positionAt(p, 9000)).toBe(22);
    expect(reducePlayback(p, { type: "seek", seconds: 500 }, 9000)?.progress).toBe(100);
  });
  it("shares repeat/shuffle controls", () => {
    const p = reducePlayback(state(), { type: "shuffle" }, 1000)!;
    expect(new Set(p.shuffleOrder).size).toBe(files.length);
    expect(p.shuffleOrder[0]).toBe(p.currentIndex);
    expect(reducePlayback(p, { type: "loop" }, 1000)?.loopMode).toBe("all");
  });
  it("rejects malformed or out-of-range commands and reports", () => {
    expect(validPlayback(state())).toBe(true);
    for (const value of [null, {}, { type: "seek", seconds: Infinity }, { type: "play", queue: files, index: 99 }, { type: "insert", file: {} }]) expect(validCommand(value)).toBe(false);
    for (const value of [{ ...state(), currentIndex: -1 }, { ...state(), shuffleOrder: [99] }, { ...state(), isPlaying: "yes" }, { ...state(), meta: { title: {} } }]) expect(validPlayback(value)).toBe(false);
  });
  it("restricts Analytics to the owner", () => {
    expect(canViewAnalytics("NongTonNee@gmail.com")).toBe(true);
    expect(canViewAnalytics("other@gmail.com")).toBe(false);
    expect(canViewAnalytics(null)).toBe(false);
  });
});

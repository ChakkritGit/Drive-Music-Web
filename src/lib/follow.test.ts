import { describe, expect, it } from "vitest";
import { follow } from "@/lib/follow";

const remote = (fileId: string, isPlaying: boolean) => ({ fileId, isPlaying });

describe("Listen together follows changes, not levels", () => {
  it("turning it on adopts the other device's track", () => {
    expect(follow(null, remote("a", true), { fileId: "b", isPlaying: false }).action).toBe("load");
  });

  it("a paused device repeating its state does not pause this one after play here", () => {
    const seen = remote("a", false);
    // Play was pressed here; the remote's next heartbeat is still "a, paused".
    expect(follow(seen, remote("a", false), { fileId: "a", isPlaying: true }).action).toBe("none");
  });

  it("the other device pausing is followed", () => {
    expect(follow(remote("a", true), remote("a", false), { fileId: "a", isPlaying: true }).action).toBe("toggle");
  });

  it("a track picked here is not switched back by the remote's heartbeat", () => {
    expect(follow(remote("a", true), remote("a", true), { fileId: "c", isPlaying: true }).action).toBe("none");
  });

  it("the other device changing track is followed", () => {
    expect(follow(remote("a", true), remote("d", true), { fileId: "a", isPlaying: true }).action).toBe("load");
  });

  it("after a load, the next broadcast applies its play state", () => {
    const { followed } = follow(remote("a", true), remote("d", false), { fileId: "a", isPlaying: true });
    expect(follow(followed, remote("d", false), { fileId: "d", isPlaying: true }).action).toBe("toggle");
  });

  it("position follows only while both play", () => {
    expect(follow(remote("a", true), remote("a", true), { fileId: "a", isPlaying: true }).action).toBe("track-position");
    expect(follow(remote("a", false), remote("a", false), { fileId: "a", isPlaying: false }).action).toBe("none");
  });
});

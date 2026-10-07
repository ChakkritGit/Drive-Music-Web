import { describe, expect, it, vi } from "vitest";
import { createAudioRecovery, tryPlay } from "@/lib/audioPlayback";

function context(state: string) {
  return { state, resume: vi.fn().mockResolvedValue(undefined) } as unknown as AudioContext;
}

describe("audio recovery", () => {
  it("retries an interruption that outlasted the first resume attempt", () => {
    const ctx = context("interrupted");
    const recover = createAudioRecovery();
    recover(ctx, false, 0);
    recover(ctx, false, 250);
    recover(ctx, false, 999);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    recover(ctx, false, 1000);
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    Object.assign(ctx, { state: "running" });
    recover(ctx, false, 2000);
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it("lets a gesture retry even while an automatic resume is still pending", () => {
    const ctx = context("suspended");
    vi.mocked(ctx.resume).mockReturnValue(new Promise(() => {}));
    const recover = createAudioRecovery();
    recover(ctx, false, 0);
    recover(ctx, true, 10);
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it("can retry a rejected automatic resume", async () => {
    const ctx = context("interrupted");
    vi.mocked(ctx.resume).mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
    const recover = createAudioRecovery();
    recover(ctx, false, 0);
    await Promise.resolve();
    recover(ctx, false, 1000);
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it("leaves running, closed and missing contexts alone", () => {
    const recover = createAudioRecovery();
    for (const state of ["running", "closed"]) {
      const ctx = context(state);
      recover(ctx, true, 0);
      expect(ctx.resume).not.toHaveBeenCalled();
    }
    expect(() => recover(null, true, 0)).not.toThrow();
  });
});

describe("tryPlay", () => {
  it("calls play in the same gesture without waiting for resume", async () => {
    const ctx = context("suspended");
    let finishResume!: () => void;
    vi.mocked(ctx.resume).mockReturnValue(new Promise<void>(resolve => { finishResume = resolve; }));
    const audio = { play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLAudioElement;
    const playing = tryPlay(audio, ctx);
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledOnce();
    finishResume();
    await playing;
  });

  it("handles autoplay denial from either permission gate", async () => {
    for (const blocked of ["context", "media"]) {
      const ctx = context("suspended");
      const play = vi.fn().mockResolvedValue(undefined);
      const denied = new DOMException("Blocked", "NotAllowedError");
      if (blocked === "context") vi.mocked(ctx.resume).mockRejectedValue(denied);
      else play.mockRejectedValue(denied);
      await expect(tryPlay({ play } as unknown as HTMLAudioElement, ctx)).resolves.toBeUndefined();
      expect(play).toHaveBeenCalledOnce();
    }
  });

  it("preserves real playback failures", async () => {
    const error = new DOMException("Bad media", "NotSupportedError");
    const audio = { play: vi.fn().mockRejectedValue(error) } as unknown as HTMLAudioElement;
    await expect(tryPlay(audio, context("running"))).rejects.toBe(error);
  });
});

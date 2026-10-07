/** Media elements can keep advancing while their shared output context is interrupted. */
export function needsAudioResume(ctx: AudioContext | null): ctx is AudioContext {
  return !!ctx && ctx.state !== "running" && ctx.state !== "closed";
}

/** Retry automatic recovery at most once a second. A gesture always gets a fresh attempt,
 * even when a previous resume promise is still waiting for browser permission. */
export function createAudioRecovery() {
  let lastContext: AudioContext | null = null;
  let lastAttempt = -Infinity;
  return (ctx: AudioContext | null, gesture = false, now = performance.now()): void => {
    if (!needsAudioResume(ctx)) return;
    if (!gesture && ctx === lastContext && now - lastAttempt < 1000) return;
    lastContext = ctx;
    lastAttempt = now;
    void ctx.resume().catch(() => {});
  };
}

/** Start both permission-gated operations in the calling gesture, before either await. */
export async function tryPlay(audio: HTMLAudioElement, ctx: AudioContext | null): Promise<void> {
  try {
    await Promise.all([needsAudioResume(ctx) ? ctx.resume() : undefined, audio.play()]);
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") return;
    throw err;
  }
}

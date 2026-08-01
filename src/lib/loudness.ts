/**
 * Simple RMS-based volume normalization — not true LUFS/ReplayGain metering, but a reasonable
 * approximation for a "nothing suddenly blasts" effect without pulling in a full loudness-
 * analysis library. Deliberately only ever attenuates: HTMLMediaElement.volume is capped at
 * 1.0, so a quiet track can't be boosted past its natural level without routing playback
 * through the Web Audio API instead (a bigger change, skipped for this first pass).
 */

// Roughly -20 dBFS RMS — a moderate reference point for typical commercially-mastered music.
// Tracks louder than this get turned down to match; quieter tracks are left alone.
const TARGET_RMS = 0.1;

// Every Nth PCM sample is plenty for a stable RMS estimate without scanning every sample of a
// multi-minute track — this is a loudness *estimate*, not sample-accurate metering.
const SAMPLE_STRIDE = 200;

/** The gain multiplier that would bring `rms` down to `targetRms`, capped at 1 (never boosts). */
export function gainForRms(rms: number, targetRms: number = TARGET_RMS): number {
  if (!Number.isFinite(rms) || rms <= 0) return 1;
  return Math.min(1, targetRms / rms);
}

/** Decodes `blob` fully to estimate its RMS loudness, returning a playback volume multiplier
 * in (0, 1]. Browser-only (uses AudioContext) — call from client code after a user gesture has
 * already unlocked audio, same as regular playback. */
export async function analyzeLoudnessGain(blob: Blob): Promise<number> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextCtor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    let sumSquares = 0;
    let sampleCount = 0;
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += SAMPLE_STRIDE) {
        sumSquares += data[i] * data[i];
        sampleCount++;
      }
    }
    const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    return gainForRms(rms);
  } finally {
    void ctx.close();
  }
}

/**
 * Simple RMS-based volume normalization — not true LUFS/ReplayGain metering, but a reasonable
 * approximation for a "nothing suddenly blasts, nothing's inaudibly quiet" effect without
 * pulling in a full loudness-analysis library. Playback routes through a Web Audio GainNode
 * (see ensureAudioGraph in PlayerContext), so this can boost a quiet track above its natural
 * level, not just attenuate a loud one — capped at MAX_GAIN so a near-silent/broken track
 * doesn't get amplified into noise.
 *
 * A single flat average over the whole track is fooled by quiet intros/outros/silence — those
 * drag the average down, so a track that's actually normal-volume in its verses/chorus reads
 * as much quieter than it is and gets over-boosted, which then makes any noise floor in the
 * *loud* parts audible too. Instead this measures loudness in short windows, throws out the
 * near-silent ones (a track's silence isn't "how loud it is"), and uses a high percentile of
 * what's left — the same shape of idea as EBU R128's gated loudness measurement, just a much
 * lighter-weight approximation of it.
 */

// Roughly -20 dBFS RMS — a moderate reference point for typical commercially-mastered music.
// Windows louder than this get turned down to match; quieter tracks get boosted up to it.
const TARGET_RMS = 0.1;

// Caps how far a quiet track gets boosted (~+12dB) — a hard safety ceiling in case a track is
// quiet throughout (not just in gated-out silent sections), so it doesn't get amplified into
// noise regardless of what the measurement says.
const MAX_GAIN = 4;

// ~400ms windows, in the same spirit as EBU R128's "momentary loudness" window — short enough
// to separate a quiet bridge from a loud chorus, long enough for a stable RMS reading.
const WINDOW_SECONDS = 0.4;

// Windows quieter than this (~-40 dBFS) are treated as silence/near-silence — a room-tone
// intro, a fade-out, the gap between tracks — and excluded from the loudness measurement
// entirely, rather than counted as "how loud this track is".
const SILENCE_THRESHOLD_RMS = 0.01;

// Use the 75th percentile of the (non-silent) windows' loudness as "the track's loudness" —
// robust against a handful of unusually loud transient peaks while still reflecting the
// track's typical loud sections, not just its quietest ones.
const LOUDNESS_PERCENTILE = 0.75;

// Every Nth PCM sample within a window is plenty for a stable RMS estimate without scanning
// every sample — this is a loudness *estimate*, not sample-accurate metering.
const SAMPLE_STRIDE = 4;

/** The gain multiplier that would bring `rms` to `targetRms`, clamped to [0, MAX_GAIN]. */
export function gainForRms(rms: number, targetRms: number = TARGET_RMS): number {
  // NaN/Infinity/negative means analysis failed (RMS is never negative for real audio) — stay
  // neutral rather than guess, since a failed reading could just as easily belong to a loud
  // track as a quiet one.
  if (!Number.isFinite(rms) || rms < 0) return 1;
  // True silence is a legitimate reading and harmless to "boost" (MAX_GAIN * 0 is still 0) —
  // more likely a quiet intro/outro than genuinely broken audio.
  if (rms === 0) return MAX_GAIN;
  return Math.min(MAX_GAIN, targetRms / rms);
}

/** Picks the "representative" RMS out of a track's per-window readings: silent windows are
 * gated out first (unless the whole track is silent, in which case there's nothing else to
 * go on), then the given percentile of what's left. Pure/testable — no audio decoding here. */
export function representativeRms(
  windowRmsValues: number[],
  percentile: number = LOUDNESS_PERCENTILE,
  silenceThreshold: number = SILENCE_THRESHOLD_RMS,
): number {
  if (windowRmsValues.length === 0) return 0;
  const loud = windowRmsValues.filter((v) => v >= silenceThreshold);
  const pool = loud.length > 0 ? loud : windowRmsValues;
  const sorted = [...pool].sort((a, b) => a - b);
  const clampedPercentile = Math.min(1, Math.max(0, percentile));
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * clampedPercentile));
  return sorted[index];
}

/** Decodes `blob` fully and computes per-window RMS across every channel — a track's loudness
 * "profile" over time, before it's collapsed down to a single representative value. Exported
 * mainly so the windowing math is reachable without going through full loudness analysis. */
function windowRmsSeries(audioBuffer: AudioBuffer, windowSeconds: number): number[] {
  const windowSamples = Math.max(1, Math.round(audioBuffer.sampleRate * windowSeconds));
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, ch) =>
    audioBuffer.getChannelData(ch),
  );
  const values: number[] = [];
  for (let start = 0; start < audioBuffer.length; start += windowSamples) {
    const end = Math.min(audioBuffer.length, start + windowSamples);
    let sumSquares = 0;
    let count = 0;
    for (let i = start; i < end; i += SAMPLE_STRIDE) {
      for (const data of channels) {
        sumSquares += data[i] * data[i];
        count++;
      }
    }
    if (count > 0) values.push(Math.sqrt(sumSquares / count));
  }
  return values;
}

/** Decodes `blob` fully to estimate its loudness, returning a playback gain multiplier (can be
 * > 1 — see MAX_GAIN). Browser-only (uses AudioContext) — call from client code after a user
 * gesture has already unlocked audio, same as regular playback. */
export async function analyzeLoudnessGain(blob: Blob): Promise<number> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextCtor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const windows = windowRmsSeries(audioBuffer, WINDOW_SECONDS);
    return gainForRms(representativeRms(windows));
  } finally {
    void ctx.close();
  }
}

/**
 * The small, cheap half of track analysis: the questions the player and the UI ask of a
 * TrackAnalysis dozens of times a second (how long is a bar? are these two keys compatible?),
 * kept apart from the DSP that produces one.
 *
 * The split is deliberate: src/lib/analyzer.ts pulls in an FFT and several hundred lines of
 * signal processing that only ever run when a track is actually being analyzed, and the player
 * reads these helpers on every ramp tick. Keeping them apart keeps the hot path small.
 */

import type { TrackAnalysis } from "@/types";

/**
 * Bumped whenever a change to src/lib/analyzer.ts would produce different numbers for the same
 * audio. Cached analyses carrying an older version are ignored and recomputed — a stale beat
 * grid is worse than none, since the mix trusts it.
 */
export const ANALYZER_VERSION = 1;

/** Seconds per beat, or null when the tempo is unknown. */
export function beatInterval(analysis: TrackAnalysis | null | undefined): number | null {
  if (!analysis?.bpm || analysis.bpm <= 0) return null;
  return 60 / analysis.bpm;
}

/**
 * How long `bars` bars last at this tempo, assuming 4/4 — the time signature essentially all
 * beat-matched popular music is in, and the one the "4 bars" transition lengths in every DJ tool
 * assume. Null when the tempo is unknown.
 */
export function secondsForBars(
  analysis: TrackAnalysis | null | undefined,
  bars: number,
): number | null {
  const interval = beatInterval(analysis);
  if (interval === null) return null;
  return bars * 4 * interval;
}

/**
 * The beat grid position at or before `time`, in seconds — where a beat-aligned action should
 * actually land if it wants to happen "now, on the beat".
 */
export function beatOnOrBefore(
  analysis: TrackAnalysis | null | undefined,
  time: number,
): number | null {
  const interval = beatInterval(analysis);
  const firstBeat = analysis?.firstBeatSeconds;
  if (interval === null || firstBeat === undefined || time < firstBeat) return null;
  const beatsElapsed = Math.floor((time - firstBeat) / interval);
  return firstBeat + beatsElapsed * interval;
}

/**
 * Whether two tracks are in harmonically compatible keys by the Camelot rule: same key, same
 * number (relative major/minor), or one step around the wheel. Unknown keys are treated as
 * compatible — the mix shouldn't refuse to do something because analysis came up empty.
 */
export function keysAreCompatible(a: string | undefined, b: string | undefined): boolean {
  const left = parseCamelot(a);
  const right = parseCamelot(b);
  if (!left || !right) return true;
  if (left.number === right.number) return true;
  if (left.letter !== right.letter) return false;
  const forward = (left.number % 12) + 1;
  const backward = ((left.number + 10) % 12) + 1;
  return right.number === forward || right.number === backward;
}

function parseCamelot(value: string | undefined): { number: number; letter: string } | null {
  if (!value) return null;
  const letter = value.slice(-1);
  if (letter !== "A" && letter !== "B") return null;
  const number = Number(value.slice(0, -1));
  if (!Number.isInteger(number) || number < 1 || number > 12) return null;
  return { number, letter };
}

export type QualityTier = "low" | "medium" | "high" | "unknown";

/**
 * How a track's spectral cutoff reads as a quality tier. The thresholds are where common
 * encoders put their low-pass, so a track landing on one is strong evidence of that encoder
 * setting — but this is a *description of the spectrum*, not a claim about the file's actual
 * bitrate, and a genuinely dark recording with no high end reads low however it was encoded.
 */
export function qualityTier(analysis: TrackAnalysis | null | undefined): QualityTier {
  const cutoff = analysis?.spectralCutoffHz;
  if (cutoff === undefined) return "unknown";
  /** Cut below ~15kHz — typically 128kbps or lower, or an old/very lossy source. */
  if (cutoff < 15_000) return "low";
  /** ~15–18kHz — roughly 192–256kbps territory. */
  if (cutoff < 18_000) return "medium";
  /** Above ~18kHz — 320kbps or lossless; nothing meaningful is missing. */
  return "high";
}

/** "128 BPM · 8A" style summary for a row badge — omits whatever wasn't detected, and is empty
 * when nothing was. */
export function analysisSummary(analysis: TrackAnalysis | null | undefined): string {
  if (!analysis) return "";
  const parts: string[] = [];
  if (analysis.bpm) parts.push(`${Math.round(analysis.bpm)} BPM`);
  if (analysis.camelotKey) parts.push(analysis.camelotKey);
  return parts.join(" · ");
}

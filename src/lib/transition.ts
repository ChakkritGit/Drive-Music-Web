/**
 * The mix engine's data model: what one transition between two tracks *is*, expressed as
 * automation lanes over a normalized 0..1 span, plus the presets that fill those lanes in and
 * the resolver that turns "these two tracks, this override" into a concrete plan.
 *
 * Everything here is pure — no Web Audio, no React, no IndexedDB. The ramp loop in
 * PlayerContext reads lane values and writes them to nodes; the editor reads and writes the
 * same lanes. Keeping the shapes as plain serializable data (rather than functions or classes)
 * is what lets a user's edited transition go straight into IndexedDB and come back intact.
 *
 * Ported from the iOS app's TransitionCurve.swift / TransitionProfile.swift / TransitionPlan.swift
 * (../drive-music-ios) — same curves, same constants, same resolution rules.
 */

import type { TrackAnalysis } from "@/types";
import { beatInterval, secondsForBars } from "@/lib/analysis";

/** One point on a lane. `t` is the position within the transition, 0..1. */
export interface TransitionKeyframe {
  t: number;
  /** What the number means depends on the lane — gain multiplier, dB, normalized filter
   * position — and each lane's own documentation says which. */
  value: number;
}

/**
 * One automation lane: a handful of keyframes, read back as a continuous value at any point in
 * 0..1.
 *
 * Linear interpolation between keyframes rather than splines or eased segments: a lane is read
 * ~60 times a second over several seconds, so the difference between linear and curved segments
 * is inaudible where it matters (volume and filter sweeps), while being able to reason about —
 * and draw — exactly what a lane does is worth a lot. Curvature that *is* audible, chiefly
 * equal-power volume, is expressed by placing more keyframes (see EQUAL_POWER_UP), not by a
 * curve type.
 */
export interface TransitionCurve {
  keyframes: TransitionKeyframe[];
}

/** Keyframes are sorted once, on the way in, so `curveValue` — which runs on every tick of
 * every transition — never has to. */
export function curve(keyframes: TransitionKeyframe[]): TransitionCurve {
  return { keyframes: [...keyframes].sort((a, b) => a.t - b.t) };
}

export function constantCurve(value: number): TransitionCurve {
  return { keyframes: [{ t: 0, value }] };
}

/** Straight line from `from` at t=0 to `to` at t=1. */
export function rampCurve(from: number, to: number): TransitionCurve {
  return { keyframes: [{ t: 0, value: from }, { t: 1, value: to }] };
}

/** The lane's value at `t`, clamped at both ends — before the first keyframe it holds the first
 * value, after the last it holds the last, so a lane never has an undefined region. */
export function curveValue(lane: TransitionCurve, t: number): number {
  const frames = lane.keyframes;
  if (frames.length === 0) return 0;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (t <= first.t) return first.value;
  if (t >= last.t) return last.value;

  let previous = first;
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    if (t <= frame.t) {
      const span = frame.t - previous.t;
      if (span <= 0) return frame.value;
      return previous.value + (frame.value - previous.value) * ((t - previous.t) / span);
    }
    previous = frame;
  }
  return last.value;
}

/** Whether this lane does anything at all — a lane that holds one value throughout can be
 * skipped rather than written to an audio node every frame, and is what the editor shows as
 * "None". */
export function isConstantCurve(lane: TransitionCurve): boolean {
  const frames = lane.keyframes;
  if (frames.length === 0) return true;
  const firstValue = frames[0].value;
  return frames.every((frame) => Math.abs(frame.value - firstValue) < 0.0001);
}

/** Whether two lanes describe the same automation. Used to recognize which named option a
 * shape's lane came from — the editor offers a handful of named shapes per lane, and has to
 * match against shapes it didn't necessarily write (a preset's, or another lane combination). */
export function curvesEqual(a: TransitionCurve, b: TransitionCurve): boolean {
  if (a.keyframes.length !== b.keyframes.length) return false;
  return a.keyframes.every((frame, index) => {
    const other = b.keyframes[index];
    return Math.abs(frame.t - other.t) < 1e-9 && Math.abs(frame.value - other.value) < 1e-9;
  });
}

/**
 * What loops during a transition, if anything. Looping the tail of the outgoing track is how a
 * DJ stretches a phrase to buy time for the next one to arrive on a downbeat — without it, a
 * transition has to start wherever the outgoing track happens to be.
 */
export type TransitionLooping = "none" | "outgoingOneBar" | "outgoingTwoBars";

export const TRANSITION_LOOPING_OPTIONS: TransitionLooping[] = [
  "none",
  "outgoingOneBar",
  "outgoingTwoBars",
];

/** How many bars are looped — null for "none". Requires a beat grid to mean anything, so a
 * track without a detected tempo silently doesn't loop (see resolveTransitionPlan). */
export function loopingBars(looping: TransitionLooping): number | null {
  switch (looping) {
    case "outgoingOneBar":
      return 1;
    case "outgoingTwoBars":
      return 2;
    default:
      return null;
  }
}

/**
 * Every automation lane of one transition, plus the presets that populate them. The lanes are
 * *data*, so the editor can offer per-transition EQ, filtering, effects, and looping without
 * each one needing new code in the ramp loop.
 *
 * All lanes run over the same normalized 0..1 span, and a lane that holds one value costs
 * nothing (see isConstantCurve) — a plain fade is this same structure with every lane but the
 * two volumes held flat.
 */
export interface TransitionShape {
  /** Gain multipliers, 0..1, applied on top of each slot's own level. */
  outgoingVolume: TransitionCurve;
  incomingVolume: TransitionCurve;
  /** Normalized filter positions, 0 = open, 1 = closed — see TRANSITION_FILTER. */
  outgoingLowPass: TransitionCurve;
  incomingHighPass: TransitionCurve;
  /** Per-slot bass shelf in dB — the "bass swap" a DJ mix is built on, done as an EQ cut rather
   * than a filter sweep so the rest of each track's low end stays where it was. */
  outgoingBass: TransitionCurve;
  incomingBass: TransitionCurve;
  /** Per-slot reverb wet/dry, 0..100. Used by "Rise", where the outgoing track washes out into
   * reverb rather than simply getting quieter. */
  outgoingReverb: TransitionCurve;
  looping: TransitionLooping;
}

/** Fills in every lane a caller didn't specify with "does nothing", so a shape is always
 * complete — the ramp loop never has to check whether a lane exists. */
export function makeShape(
  parts: Pick<TransitionShape, "outgoingVolume" | "incomingVolume"> & Partial<TransitionShape>,
): TransitionShape {
  return {
    outgoingLowPass: constantCurve(0),
    incomingHighPass: constantCurve(0),
    outgoingBass: constantCurve(0),
    incomingBass: constantCurve(0),
    outgoingReverb: constantCurve(0),
    looping: "none",
    ...parts,
  };
}

export function shapesEqual(a: TransitionShape, b: TransitionShape): boolean {
  return (
    a.looping === b.looping &&
    curvesEqual(a.outgoingVolume, b.outgoingVolume) &&
    curvesEqual(a.incomingVolume, b.incomingVolume) &&
    curvesEqual(a.outgoingLowPass, b.outgoingLowPass) &&
    curvesEqual(a.incomingHighPass, b.incomingHighPass) &&
    curvesEqual(a.outgoingBass, b.outgoingBass) &&
    curvesEqual(a.incomingBass, b.incomingBass) &&
    curvesEqual(a.outgoingReverb, b.outgoingReverb)
  );
}

// MARK: - Equal-power volume
//
// Two linear ramps crossing at the midpoint sum to noticeably *less* than either alone there —
// uncorrelated signals add by power, not amplitude — which is the classic mid-mix volume sag.
// These sample a quarter-turn of cos/sin at five points instead, which holds the summed power
// near constant. Five is where adding more stopped mattering; each segment is short enough that
// interpolating across it linearly is indistinguishable from the real curve.

export const EQUAL_POWER_DOWN: TransitionCurve = curve(
  [0, 1, 2, 3, 4].map((step) => {
    const t = step / 4;
    return { t, value: Math.cos((t * Math.PI) / 2) };
  }),
);

export const EQUAL_POWER_UP: TransitionCurve = curve(
  [0, 1, 2, 3, 4].map((step) => {
    const t = step / 4;
    return { t, value: Math.sin((t * Math.PI) / 2) };
  }),
);

/**
 * The two ends of a filter sweep. "Open" means inaudible: a high-pass down at 20Hz and a
 * low-pass up at 20kHz both pass the whole musical range, so a sweep can start or end there
 * without a click. "Closed" is how far a transition pushes them — 400Hz strips a track's bass
 * without hollowing it out entirely, which is the point of a bass swap.
 */
export const TRANSITION_FILTER = {
  openLowFrequency: 20,
  openHighFrequency: 20_000,
  closedFrequency: 400,

  /** Maps a lane's normalized 0..1 position to a frequency, geometrically. Pitch — and how a
   * filter sweep reads to the ear — is logarithmic in frequency, so a lane that moved linearly
   * in Hz would spend nearly all its travel in a range that's already inaudible and lurch
   * through the part that matters. 0 is fully open, 1 fully closed, for both filter types. */
  highPassFrequency(position: number): number {
    const clamped = Math.min(1, Math.max(0, position));
    return (
      TRANSITION_FILTER.openLowFrequency *
      Math.pow(TRANSITION_FILTER.closedFrequency / TRANSITION_FILTER.openLowFrequency, clamped)
    );
  },

  lowPassFrequency(position: number): number {
    const clamped = Math.min(1, Math.max(0, position));
    return (
      TRANSITION_FILTER.openHighFrequency *
      Math.pow(TRANSITION_FILTER.closedFrequency / TRANSITION_FILTER.openHighFrequency, clamped)
    );
  },
} as const;

/**
 * The presets offered in the editor. A preset is a starting point, not a mode: selecting one
 * fills the lanes in, and adjusting any lane afterwards leaves a shape that no longer matches
 * any preset, which is exactly what gets stored.
 */
export type TransitionPreset = "fade" | "mix" | "rise" | "blend";

export const TRANSITION_PRESETS: TransitionPreset[] = ["fade", "mix", "rise", "blend"];

export const PRESET_LABELS: Record<TransitionPreset, string> = {
  fade: "Fade",
  mix: "Mix",
  rise: "Rise",
  blend: "Blend",
};

/** A plain volume crossfade, nothing else — what this app did before mixing existed. */
const FADE_SHAPE: TransitionShape = makeShape({
  outgoingVolume: rampCurve(1, 0),
  incomingVolume: rampCurve(0, 1),
});

/** The DJ bass swap: the incoming track arrives with its low end pulled back so it doesn't
 * collide with the outgoing one's, and opens up as it takes over. */
const MIX_SHAPE: TransitionShape = makeShape({
  // Held fuller for longer on both sides than an equal-power crossfade would be. The two tracks
  // overlap at close to full level through the middle third, and what keeps that from turning
  // to mud is the bass swap and the filters below — not turning either track down.
  outgoingVolume: curve([
    { t: 0, value: 1 },
    { t: 0.55, value: 0.95 },
    { t: 0.8, value: 0.6 },
    { t: 1, value: 0 },
  ]),
  incomingVolume: curve([
    { t: 0, value: 0 },
    { t: 0.2, value: 0.6 },
    { t: 0.45, value: 0.95 },
    { t: 1, value: 1 },
  ]),
  // The outgoing track loses its top end late and completely — it thins out and recedes rather
  // than simply getting quieter, which is what gives the exit a sense of distance.
  outgoingLowPass: curve([
    { t: 0, value: 0 },
    { t: 0.45, value: 0.15 },
    { t: 0.75, value: 0.6 },
    { t: 1, value: 1 },
  ]),
  // The incoming track arrives filtered and opens up early — by the midpoint it's full-range
  // and carrying the mix, while the outgoing one is still audible behind it. That overlap of a
  // *complete* track over a receding one is the depth.
  incomingHighPass: curve([
    { t: 0, value: 1 },
    { t: 0.25, value: 0.6 },
    { t: 0.5, value: 0 },
    { t: 1, value: 0 },
  ]),
  // The bass swap — the single most characteristic move in a DJ transition. Only one track can
  // own the low end; two sharing it is the muddiness people hear as "just a crossfade with EQ".
  // Swapped over a tenth of the transition rather than instantly, so it reads as a handover
  // rather than a cut.
  outgoingBass: curve([
    { t: 0, value: 0 },
    { t: 0.4, value: 0 },
    { t: 0.5, value: -18 },
    { t: 1, value: -24 },
  ]),
  incomingBass: curve([
    { t: 0, value: -24 },
    { t: 0.4, value: -18 },
    { t: 0.5, value: 0 },
    { t: 1, value: 0 },
  ]),
  // A little space under the outgoing track as it leaves. Kept low (35 of 100) and starting
  // late: enough that the tail sounds like it's moving away rather than being faded down, not
  // so much that it turns into the "Rise" wash.
  outgoingReverb: curve([
    { t: 0, value: 0 },
    { t: 0.6, value: 0 },
    { t: 1, value: 35 },
  ]),
});

/** The outgoing track washes out — filtered down and drowned in reverb — while the incoming one
 * comes up underneath. Reads as a lift rather than a handover. */
const RISE_SHAPE: TransitionShape = makeShape({
  outgoingVolume: EQUAL_POWER_DOWN,
  incomingVolume: EQUAL_POWER_UP,
  // Closes much further than `mix` — the outgoing track is meant to disappear into a wash
  // rather than hand over cleanly.
  outgoingLowPass: rampCurve(0, 1),
  incomingHighPass: curve([
    { t: 0, value: 0.7 },
    { t: 0.6, value: 0 },
    { t: 1, value: 0 },
  ]),
  outgoingReverb: rampCurve(0, 80),
  looping: "outgoingOneBar",
});

/** Both tracks sit at full level through the middle, with only their bass swapped. The most
 * seamless of the four when the two tracks are compatible, and the muddiest when they aren't. */
const BLEND_SHAPE: TransitionShape = makeShape({
  // Both held near full through the middle — the volume lanes barely move, and the whole
  // transition is carried by the bass swap below.
  outgoingVolume: curve([
    { t: 0, value: 1 },
    { t: 0.75, value: 1 },
    { t: 1, value: 0 },
  ]),
  incomingVolume: curve([
    { t: 0, value: 0 },
    { t: 0.25, value: 1 },
    { t: 1, value: 1 },
  ]),
  // A hard swap at the midpoint: whichever track owns the low end owns the groove, and two
  // tracks sharing it is exactly what makes an overlap sound like mud.
  outgoingBass: curve([
    { t: 0, value: 0 },
    { t: 0.45, value: 0 },
    { t: 0.55, value: -24 },
    { t: 1, value: -24 },
  ]),
  incomingBass: curve([
    { t: 0, value: -24 },
    { t: 0.45, value: -24 },
    { t: 0.55, value: 0 },
    { t: 1, value: 0 },
  ]),
});

const PRESET_SHAPES: Record<TransitionPreset, TransitionShape> = {
  fade: FADE_SHAPE,
  mix: MIX_SHAPE,
  rise: RISE_SHAPE,
  blend: BLEND_SHAPE,
};

/** The lanes a preset fills in. Returned as a fresh object graph: the editor edits shapes by
 * spreading them, and handing out the module-level constant would let one edited transition
 * mutate the preset every other transition resolves from. */
export function presetShape(preset: TransitionPreset): TransitionShape {
  const source = PRESET_SHAPES[preset];
  return {
    outgoingVolume: curve(source.outgoingVolume.keyframes),
    incomingVolume: curve(source.incomingVolume.keyframes),
    outgoingLowPass: curve(source.outgoingLowPass.keyframes),
    incomingHighPass: curve(source.incomingHighPass.keyframes),
    outgoingBass: curve(source.outgoingBass.keyframes),
    incomingBass: curve(source.incomingBass.keyframes),
    outgoingReverb: curve(source.outgoingReverb.keyframes),
    looping: source.looping,
  };
}

/** Which preset a shape came from, or null once it's been edited away from all of them. Powers
 * the editor's "Custom" state without storing a flag alongside the shape. */
export function matchingPreset(shape: TransitionShape): TransitionPreset | null {
  return TRANSITION_PRESETS.find((preset) => shapesEqual(PRESET_SHAPES[preset], shape)) ?? null;
}

/**
 * A user's stored intent for one transition — what the editor edits and the "Auto ›" chip
 * between two rows displays. Undefined fields mean "let the app decide", which is what `auto`
 * is: not a separate mode, just an override that hasn't been made.
 */
export interface TransitionSettings {
  /** The full automation shape, once the user has touched anything. Stored as the shape itself
   * rather than a preset name so an edited transition survives — a preset is only ever a
   * starting point, and matchingPreset recovers the name when it still fits. */
  shape?: TransitionShape;
  bars?: number;
  beatmatchEnabled?: boolean;
  /** Where in the outgoing track the mix begins, in seconds. Undefined lets the app choose — the
   * last bar line that still leaves room for the whole transition. Set by dragging the marker on
   * the outgoing waveform, and used exactly as given: a hand-placed start is a decision, not a
   * suggestion to be snapped somewhere else. */
  outgoingStartSeconds?: number;
  /** Where the incoming track starts playing from, in seconds. Undefined uses its detected
   * mix-in point — useful for skipping an intro, or starting on a drop rather than at the top. */
  incomingStartSeconds?: number;
}

/** Nothing overridden — the app picks everything. The state every transition starts in. */
export const AUTO_TRANSITION: TransitionSettings = {};

export function isAutoTransition(settings: TransitionSettings): boolean {
  return (
    settings.shape === undefined &&
    settings.bars === undefined &&
    settings.beatmatchEnabled === undefined &&
    settings.outgoingStartSeconds === undefined &&
    settings.incomingStartSeconds === undefined
  );
}

/** Transition lengths offered in the editor, in bars. Powers of two because that's how popular
 * music is phrased — a transition that isn't a whole number of bars lands the incoming track's
 * downbeat somewhere the listener isn't expecting one. */
export const BAR_OPTIONS = [1, 2, 4, 8, 16];

/**
 * Everything needed to actually run one transition, resolved from the two tracks' analyses and
 * whatever the user overrode. Computing this as a value up front — rather than having the ramp
 * loop reach for tempo and key as it goes — is what makes the decisions inspectable.
 */
export interface TransitionPlan {
  shape: TransitionShape;
  duration: number;
  /** Where in the outgoing track the transition should start, in seconds. Null means "wherever
   * the normal end-of-track trigger fires." */
  startSeconds: number | null;
  /** Where the incoming track should start playing from — past its intro, so the two grids line
   * up rather than the mix landing on a lead-in that hasn't got going yet. */
  incomingStartSeconds: number;
  /** Rate to play the incoming track at during the transition so its tempo matches the outgoing
   * one. 1 when beatmatching is off or either tempo is unknown. */
  incomingRate: number;
  /** The stretch of the outgoing track to loop, in seconds, or null for no loop. A loop is
   * measured in bars, so without a tempo there's nothing to measure and this stays null. */
  outgoingLoop: { start: number; end: number } | null;
}

/** The most either track may be stretched. Beyond ~6% the time-stretch artifacts are audible on
 * percussive material, and tracks further apart than that don't belong beat-matched anyway — the
 * honest answer there is to play them back to back. */
export const MAXIMUM_TEMPO_STRETCH = 0.06;

export interface TransitionPlanInput {
  settings: TransitionSettings;
  outgoing: TrackAnalysis | null | undefined;
  incoming: TrackAnalysis | null | undefined;
  /** Total length of the outgoing track, used only to cap the transition. Null when unknown,
   * which simply skips the cap. */
  outgoingDuration: number | null;
  /** The user's global crossfade length — the only available answer when there's no tempo. */
  fallbackDuration: number;
  autoMixEnabled: boolean;
  beatmatchEnabledByDefault: boolean;
}

/**
 * Resolves a plan. `outgoing`/`incoming` may be missing (never analyzed, or analysis found
 * nothing usable) — every step below degrades to the un-analyzed behavior rather than refusing,
 * so an unanalyzed library still crossfades exactly as it did before.
 */
export function resolveTransitionPlan(input: TransitionPlanInput): TransitionPlan {
  const {
    settings,
    outgoing,
    incoming,
    outgoingDuration,
    fallbackDuration,
    autoMixEnabled,
    beatmatchEnabledByDefault,
  } = input;

  const shape = settings.shape ?? presetShape(autoMixEnabled ? "mix" : "fade");

  // Length: a bar count only means something when there's a tempo to measure bars against.
  // Without one, the user's global crossfade length is the only available answer.
  const bars = settings.bars ?? defaultBars(shape);
  let duration = secondsForBars(outgoing, bars) ?? fallbackDuration;
  // Capped against the outgoing track itself. A bar count is a musical length, not a fraction of
  // a song: 16 bars at 70 BPM is nearly a minute, which on a short interlude means a transition
  // longer than the track it's leaving. A third of the track is generous and leaves the majority
  // of it heard on its own.
  if (outgoingDuration !== null && outgoingDuration > 0) {
    duration = Math.min(duration, outgoingDuration / 3);
  }

  // Only ever the user's own choice. When they haven't made one this stays null and the caller
  // picks the last bar line that still fits the transition — see beatAlignedStart in
  // PlayerContext.
  const startSeconds = settings.outgoingStartSeconds ?? null;

  // Skip whatever leads in before the incoming track's arrival. Tracks routinely open with a
  // fraction of a second of silence or a lead-in noise, and starting from frame 0 pushes the
  // whole grid out by that much. mixInSeconds first — firstBeatSeconds is only a phase, and
  // remains here as a fallback for analyses that found a grid but no clear arrival point.
  const incomingStartSeconds =
    settings.incomingStartSeconds ?? incoming?.mixInSeconds ?? incoming?.firstBeatSeconds ?? 0;

  const beatmatch = settings.beatmatchEnabled ?? beatmatchEnabledByDefault;
  const incomingRate = beatmatch ? matchRate(outgoing, incoming) : 1;

  // A loop runs for the length of the transition, ending where the transition starts from — it's
  // the tail of the outgoing track being held, not extra material added after it.
  let outgoingLoop: { start: number; end: number } | null = null;
  const loopBars = loopingBars(shape.looping);
  const loopLength = loopBars === null ? null : secondsForBars(outgoing, loopBars);
  if (loopLength !== null && loopLength !== undefined && startSeconds !== null) {
    if (startSeconds - loopLength >= 0) {
      outgoingLoop = { start: startSeconds - loopLength, end: startSeconds };
    }
  }

  return { shape, duration, startSeconds, incomingStartSeconds, incomingRate, outgoingLoop };
}

/** A plain volume fade is a short, utilitarian thing; anything that filters, swaps bass, or
 * washes out needs room to be heard doing it — 4 bars is roughly 8 seconds at 120 BPM, which is
 * what every DJ tool defaults to. */
function defaultBars(shape: TransitionShape): number {
  const isPlainFade =
    isConstantCurve(shape.outgoingLowPass) &&
    isConstantCurve(shape.incomingHighPass) &&
    isConstantCurve(shape.outgoingBass) &&
    isConstantCurve(shape.incomingBass) &&
    isConstantCurve(shape.outgoingReverb);
  return isPlainFade ? 2 : 4;
}

/** The rate that makes the incoming track's tempo equal the outgoing one's — or 1 when either
 * tempo is unknown or they're too far apart to match without audible damage. */
function matchRate(
  outgoing: TrackAnalysis | null | undefined,
  incoming: TrackAnalysis | null | undefined,
): number {
  const outgoingBpm = outgoing?.bpm;
  const incomingBpm = incoming?.bpm;
  if (!outgoingBpm || !incomingBpm || outgoingBpm <= 0 || incomingBpm <= 0) return 1;
  const ratio = outgoingBpm / incomingBpm;
  if (Math.abs(ratio - 1) > MAXIMUM_TEMPO_STRETCH) return 1;
  return ratio;
}

/**
 * Where the transition out of a track should actually begin, on that track's own clock.
 *
 * Snapped forward to the outgoing track's next bar line. Bars, not beats: a transition that
 * begins mid-bar puts the incoming track's downbeat on the outgoing track's beat 2 or 3, which
 * is more disorienting than no alignment at all.
 *
 * Returns null when there's nothing to propose — no grid and no mix-out point — in which case
 * the caller's end-of-track trigger stands ("start once the remaining time is down to the
 * transition's length"), exactly the behavior a plain crossfade has always had.
 */
export function beatAlignedStart(
  plan: TransitionPlan,
  analysis: TrackAnalysis | null | undefined,
  trackDuration: number,
): number | null {
  // A start the user placed by hand is used exactly as given — not snapped to a bar, not
  // second-guessed against the track's length. They were looking at the waveform when they put
  // it there.
  if (plan.startSeconds !== null) return plan.startSeconds;
  if (trackDuration <= 0) return null;

  // Where the outro starts, when the track has one — the point to leave on.
  //
  // The alternative is "late enough that the transition finishes as the track runs out", which
  // puts every mix in the final seconds: the outgoing track is heard through its entire
  // fade-out, ring-out and trailing silence before anything happens. Mixing out where the
  // arrangement actually stops is what a DJ does, and on a track with a long outro it is a long
  // way before the end. Capped at the old value rather than replacing it, so this can only ever
  // move the mix *earlier* — a mix-out point later than that wouldn't leave room for the
  // transition to finish inside the track.
  const latestFittingStart = trackDuration - plan.duration;
  const mixOut =
    analysis?.mixOutSeconds === undefined
      ? null
      : Math.min(analysis.mixOutSeconds, latestFittingStart);

  const interval = beatInterval(analysis);
  const firstBeat = analysis?.firstBeatSeconds;
  if (interval === null || firstBeat === undefined) {
    // No usable grid. A mix-out point is still worth honoring unaligned — leaving on the outro
    // instead of after it is audible regardless of whether the two grids line up, and tracks
    // that defeat tempo detection (ambient, solo piano, live) are exactly the ones with the
    // longest tails.
    return mixOut;
  }

  const barLength = interval * 4;
  const idealStart = mixOut ?? latestFittingStart;
  if (idealStart <= firstBeat) return mixOut;

  const barsElapsed = Math.ceil((idealStart - firstBeat) / barLength);
  const aligned = firstBeat + barsElapsed * barLength;
  // Snapping forward can push the start past where the track ends. Half a bar of slack: ending
  // a hair early is fine, but a transition that would be cut off by the track running out is
  // worse than an unaligned one — so fall back to the unaligned mix-out rather than giving up
  // and waiting for the end.
  if (aligned + plan.duration > trackDuration + barLength / 2) return mixOut;
  return aligned;
}

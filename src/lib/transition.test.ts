import { describe, expect, it } from "vitest";
import {
  AUTO_TRANSITION,
  beatAlignedStart,
  BAR_OPTIONS,
  EQUAL_POWER_DOWN,
  EQUAL_POWER_UP,
  MAXIMUM_TEMPO_STRETCH,
  TRANSITION_FILTER,
  constantCurve,
  curve,
  curveValue,
  isAutoTransition,
  isConstantCurve,
  loopingBars,
  matchingPreset,
  presetShape,
  rampCurve,
  resolveTransitionPlan,
  shapesEqual,
} from "@/lib/transition";
import { ANALYZER_VERSION } from "@/lib/analysis";
import type { TrackAnalysis } from "@/types";

function analysis(parts: Partial<TrackAnalysis> = {}): TrackAnalysis {
  return { fileId: "a", waveform: [], version: ANALYZER_VERSION, ...parts };
}

describe("curveValue", () => {
  it("interpolates linearly between keyframes", () => {
    const lane = rampCurve(0, 1);
    expect(curveValue(lane, 0)).toBeCloseTo(0);
    expect(curveValue(lane, 0.5)).toBeCloseTo(0.5);
    expect(curveValue(lane, 1)).toBeCloseTo(1);
  });

  it("holds the first and last values outside the keyframed range", () => {
    const lane = curve([
      { t: 0.25, value: 2 },
      { t: 0.75, value: 4 },
    ]);
    expect(curveValue(lane, 0)).toBe(2);
    expect(curveValue(lane, 1)).toBe(4);
    expect(curveValue(lane, 0.5)).toBeCloseTo(3);
  });

  it("sorts keyframes given out of order", () => {
    const lane = curve([
      { t: 1, value: 10 },
      { t: 0, value: 0 },
    ]);
    expect(curveValue(lane, 0.5)).toBeCloseTo(5);
  });

  it("returns 0 for an empty lane rather than throwing", () => {
    expect(curveValue({ keyframes: [] }, 0.5)).toBe(0);
  });
});

describe("equal-power volume", () => {
  it("keeps the summed power near constant across the crossover", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const down = curveValue(EQUAL_POWER_DOWN, t);
      const up = curveValue(EQUAL_POWER_UP, t);
      expect(down * down + up * up).toBeCloseTo(1, 5);
    }
  });

  it("sags less at the midpoint than two linear ramps would", () => {
    const linear = 0.5 * 0.5 + 0.5 * 0.5;
    const equalPower =
      curveValue(EQUAL_POWER_DOWN, 0.5) ** 2 + curveValue(EQUAL_POWER_UP, 0.5) ** 2;
    expect(equalPower).toBeGreaterThan(linear);
  });
});

describe("isConstantCurve", () => {
  it("recognizes a lane that never moves", () => {
    expect(isConstantCurve(constantCurve(0))).toBe(true);
    expect(isConstantCurve(constantCurve(-24))).toBe(true);
  });

  it("recognizes a lane that does move", () => {
    expect(isConstantCurve(rampCurve(0, 1))).toBe(false);
  });
});

describe("TRANSITION_FILTER", () => {
  it("maps a fully open position to an inaudible filter frequency", () => {
    expect(TRANSITION_FILTER.highPassFrequency(0)).toBeCloseTo(20);
    expect(TRANSITION_FILTER.lowPassFrequency(0)).toBeCloseTo(20_000);
  });

  it("maps a fully closed position to the bass-swap frequency", () => {
    expect(TRANSITION_FILTER.highPassFrequency(1)).toBeCloseTo(400);
    expect(TRANSITION_FILTER.lowPassFrequency(1)).toBeCloseTo(400);
  });

  it("travels geometrically, so the midpoint is the geometric mean", () => {
    expect(TRANSITION_FILTER.lowPassFrequency(0.5)).toBeCloseTo(Math.sqrt(20_000 * 400), 3);
  });

  it("clamps positions outside 0..1", () => {
    expect(TRANSITION_FILTER.highPassFrequency(-1)).toBeCloseTo(20);
    expect(TRANSITION_FILTER.lowPassFrequency(2)).toBeCloseTo(400);
  });
});

describe("presets", () => {
  it("round-trips every preset through matchingPreset", () => {
    for (const preset of ["fade", "mix", "rise", "blend"] as const) {
      expect(matchingPreset(presetShape(preset))).toBe(preset);
    }
  });

  it("reports no preset for a shape that's been edited away from all of them", () => {
    const edited = presetShape("mix");
    edited.outgoingReverb = rampCurve(0, 100);
    expect(matchingPreset(edited)).toBeNull();
  });

  it("hands out a copy, so editing one transition can't rewrite the preset", () => {
    const first = presetShape("mix");
    first.outgoingBass = constantCurve(0);
    expect(shapesEqual(presetShape("mix"), first)).toBe(false);
  });

  it("gives fade a plain volume crossfade and nothing else", () => {
    const fade = presetShape("fade");
    expect(isConstantCurve(fade.outgoingLowPass)).toBe(true);
    expect(isConstantCurve(fade.incomingHighPass)).toBe(true);
    expect(isConstantCurve(fade.outgoingBass)).toBe(true);
    expect(isConstantCurve(fade.outgoingReverb)).toBe(true);
    expect(fade.looping).toBe("none");
  });

  it("swaps the bass in mix and blend — the move that makes a mix not a crossfade", () => {
    for (const preset of ["mix", "blend"] as const) {
      const shape = presetShape(preset);
      expect(curveValue(shape.outgoingBass, 0)).toBe(0);
      expect(curveValue(shape.outgoingBass, 1)).toBeLessThan(-12);
      expect(curveValue(shape.incomingBass, 0)).toBeLessThan(-12);
      expect(curveValue(shape.incomingBass, 1)).toBe(0);
    }
  });

  it("keeps both tracks near full through the middle of a blend", () => {
    const blend = presetShape("blend");
    expect(curveValue(blend.outgoingVolume, 0.5)).toBeCloseTo(1);
    expect(curveValue(blend.incomingVolume, 0.5)).toBeCloseTo(1);
  });

  it("washes the outgoing track out in rise", () => {
    const rise = presetShape("rise");
    expect(curveValue(rise.outgoingReverb, 1)).toBe(80);
    expect(curveValue(rise.outgoingLowPass, 1)).toBe(1);
    expect(rise.looping).toBe("outgoingOneBar");
  });
});

describe("loopingBars", () => {
  it("maps each option to a bar count", () => {
    expect(loopingBars("none")).toBeNull();
    expect(loopingBars("outgoingOneBar")).toBe(1);
    expect(loopingBars("outgoingTwoBars")).toBe(2);
  });
});

describe("isAutoTransition", () => {
  it("treats an untouched transition as auto", () => {
    expect(isAutoTransition(AUTO_TRANSITION)).toBe(true);
  });

  it("stops being auto as soon as anything is overridden", () => {
    expect(isAutoTransition({ bars: 4 })).toBe(false);
    expect(isAutoTransition({ beatmatchEnabled: false })).toBe(false);
    expect(isAutoTransition({ outgoingStartSeconds: 12 })).toBe(false);
    expect(isAutoTransition({ shape: presetShape("mix") })).toBe(false);
  });
});

describe("resolveTransitionPlan", () => {
  const base = {
    settings: AUTO_TRANSITION,
    outgoing: null,
    incoming: null,
    outgoingDuration: 240,
    fallbackDuration: 6,
    autoMixEnabled: true,
    beatmatchEnabledByDefault: true,
  };

  it("falls back to the crossfade length when neither track has a tempo", () => {
    const plan = resolveTransitionPlan(base);
    expect(plan.duration).toBe(6);
    expect(plan.incomingRate).toBe(1);
    expect(plan.incomingStartSeconds).toBe(0);
    expect(plan.startSeconds).toBeNull();
    expect(plan.outgoingLoop).toBeNull();
  });

  it("uses the mix preset when auto mix is on and a plain fade when it isn't", () => {
    expect(matchingPreset(resolveTransitionPlan(base).shape)).toBe("mix");
    expect(matchingPreset(resolveTransitionPlan({ ...base, autoMixEnabled: false }).shape)).toBe(
      "fade",
    );
  });

  it("measures the transition in bars once the outgoing track has a tempo", () => {
    // 120 BPM: a bar is 2s, and a mix defaults to 4 bars.
    const plan = resolveTransitionPlan({ ...base, outgoing: analysis({ bpm: 120 }) });
    expect(plan.duration).toBeCloseTo(8);
  });

  it("gives a plain fade fewer bars than a mix", () => {
    const plan = resolveTransitionPlan({
      ...base,
      autoMixEnabled: false,
      outgoing: analysis({ bpm: 120 }),
    });
    expect(plan.duration).toBeCloseTo(4);
  });

  it("honours an explicit bar count", () => {
    const plan = resolveTransitionPlan({
      ...base,
      settings: { bars: 16 },
      outgoing: analysis({ bpm: 120 }),
      outgoingDuration: 600,
    });
    expect(plan.duration).toBeCloseTo(32);
  });

  it("never lets a transition run longer than a third of the track it's leaving", () => {
    // 16 bars at 70 BPM is nearly a minute — far too long for a 45-second interlude.
    const plan = resolveTransitionPlan({
      ...base,
      settings: { bars: 16 },
      outgoing: analysis({ bpm: 70 }),
      outgoingDuration: 45,
    });
    expect(plan.duration).toBeCloseTo(15);
  });

  it("starts the incoming track at its mix-in point rather than 0:00", () => {
    const plan = resolveTransitionPlan({
      ...base,
      incoming: analysis({ mixInSeconds: 12.5, firstBeatSeconds: 0.2 }),
    });
    expect(plan.incomingStartSeconds).toBeCloseTo(12.5);
  });

  it("falls back to the first beat when there's no mix-in point", () => {
    const plan = resolveTransitionPlan({ ...base, incoming: analysis({ firstBeatSeconds: 0.4 }) });
    expect(plan.incomingStartSeconds).toBeCloseTo(0.4);
  });

  it("uses a hand-placed incoming start exactly as given", () => {
    const plan = resolveTransitionPlan({
      ...base,
      settings: { incomingStartSeconds: 30 },
      incoming: analysis({ mixInSeconds: 12.5 }),
    });
    expect(plan.incomingStartSeconds).toBe(30);
  });

  it("beatmatches two close tempos", () => {
    const plan = resolveTransitionPlan({
      ...base,
      outgoing: analysis({ bpm: 124 }),
      incoming: analysis({ fileId: "b", bpm: 120 }),
    });
    expect(plan.incomingRate).toBeCloseTo(124 / 120);
    expect(Math.abs(plan.incomingRate - 1)).toBeLessThanOrEqual(MAXIMUM_TEMPO_STRETCH);
  });

  it("refuses to stretch two tempos that are too far apart", () => {
    const plan = resolveTransitionPlan({
      ...base,
      outgoing: analysis({ bpm: 140 }),
      incoming: analysis({ fileId: "b", bpm: 120 }),
    });
    expect(plan.incomingRate).toBe(1);
  });

  it("leaves the rate alone when beatmatching is off for this pair", () => {
    const plan = resolveTransitionPlan({
      ...base,
      settings: { beatmatchEnabled: false },
      outgoing: analysis({ bpm: 124 }),
      incoming: analysis({ fileId: "b", bpm: 120 }),
    });
    expect(plan.incomingRate).toBe(1);
  });

  it("resolves a tail loop against the outgoing grid and the chosen start", () => {
    const plan = resolveTransitionPlan({
      ...base,
      settings: { shape: presetShape("rise"), outgoingStartSeconds: 100 },
      outgoing: analysis({ bpm: 120 }),
    });
    // One bar at 120 BPM is 2 seconds, ending where the transition begins.
    expect(plan.outgoingLoop).toEqual({ start: 98, end: 100 });
  });

  it("doesn't loop without a tempo to measure bars against", () => {
    const plan = resolveTransitionPlan({
      ...base,
      settings: { shape: presetShape("rise"), outgoingStartSeconds: 100 },
    });
    expect(plan.outgoingLoop).toBeNull();
  });

  it("doesn't loop when the user hasn't placed a start for it to end at", () => {
    const plan = resolveTransitionPlan({
      ...base,
      settings: { shape: presetShape("rise") },
      outgoing: analysis({ bpm: 120 }),
    });
    expect(plan.outgoingLoop).toBeNull();
  });

  it("passes a hand-placed outgoing start straight through", () => {
    const plan = resolveTransitionPlan({ ...base, settings: { outgoingStartSeconds: 87.5 } });
    expect(plan.startSeconds).toBe(87.5);
  });

  it("offers only whole-phrase transition lengths", () => {
    expect(BAR_OPTIONS).toEqual([1, 2, 4, 8, 16]);
  });
});

describe("beatAlignedStart", () => {
  const plan = (parts: Partial<ReturnType<typeof resolveTransitionPlan>> = {}) => ({
    ...resolveTransitionPlan({
      settings: AUTO_TRANSITION,
      outgoing: analysis({ bpm: 120 }),
      incoming: null,
      outgoingDuration: 240,
      fallbackDuration: 6,
      autoMixEnabled: true,
      beatmatchEnabledByDefault: false,
    }),
    ...parts,
  });

  it("uses a hand-placed start exactly as given, unsnapped", () => {
    const start = beatAlignedStart(plan({ startSeconds: 91.3 }), analysis({ bpm: 120 }), 240);
    expect(start).toBe(91.3);
  });

  it("lands on a bar line of the outgoing grid", () => {
    // 120 BPM, grid starting at 0.5 -> bars at 0.5, 2.5, 4.5, ...
    const outgoing = analysis({ bpm: 120, firstBeatSeconds: 0.5, mixOutSeconds: 200 });
    const start = beatAlignedStart(plan(), outgoing, 240)!;
    expect((start - 0.5) % 2).toBeCloseTo(0);
    expect(start).toBeGreaterThanOrEqual(200);
    expect(start).toBeLessThan(202);
  });

  it("leaves on the outro rather than at the end of the track", () => {
    const outgoing = analysis({ bpm: 120, firstBeatSeconds: 0, mixOutSeconds: 180 });
    expect(beatAlignedStart(plan(), outgoing, 240)!).toBeLessThan(190);
  });

  it("honours a mix-out point even without a beat grid", () => {
    const outgoing = analysis({ mixOutSeconds: 180 });
    expect(beatAlignedStart(plan(), outgoing, 240)).toBe(180);
  });

  it("proposes nothing when there's neither a grid nor an outro", () => {
    expect(beatAlignedStart(plan(), analysis(), 240)).toBeNull();
    expect(beatAlignedStart(plan(), null, 240)).toBeNull();
  });

  it("never proposes a start the transition couldn't finish inside", () => {
    // A mix-out point later than "the transition still fits" is clamped back.
    const outgoing = analysis({ mixOutSeconds: 239 });
    const resolved = plan();
    const start = beatAlignedStart(resolved, outgoing, 240)!;
    expect(start + resolved.duration).toBeLessThanOrEqual(240.001);
  });
});

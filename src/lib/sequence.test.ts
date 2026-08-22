import { describe, expect, it } from "vitest";
import {
  energyScore,
  keyScore,
  pathScore,
  sequenceTracks,
  tempoScore,
  trackEnergy,
  transitionScore,
} from "@/lib/sequence";
import { ANALYZER_VERSION } from "@/lib/analysis";
import type { TrackAnalysis } from "@/types";

function track(fileId: string, parts: Partial<TrackAnalysis> = {}): TrackAnalysis {
  return { fileId, waveform: [], version: ANALYZER_VERSION, ...parts };
}

/** A flat envelope at `level`, which is what trackEnergy reads the median of. */
function envelopeAt(level: number): number[] {
  return new Array(50).fill(level);
}

describe("tempoScore", () => {
  it("prefers a close tempo to a distant one", () => {
    const from = track("a", { bpm: 124 });
    expect(tempoScore(from, track("b", { bpm: 126 }))).toBeGreaterThan(
      tempoScore(from, track("c", { bpm: 138 })),
    );
  });

  it("scores everything the engine can beatmatch highly", () => {
    const from = track("a", { bpm: 120 });
    // 6% is the engine's own stretch limit — see MAXIMUM_TEMPO_STRETCH.
    expect(tempoScore(from, track("b", { bpm: 127 }))).toBeGreaterThanOrEqual(0.65);
    expect(tempoScore(from, track("c", { bpm: 120 }))).toBeCloseTo(1);
  });

  it("treats half and double time as the same pulse", () => {
    expect(tempoScore(track("a", { bpm: 140 }), track("b", { bpm: 70 }))).toBeCloseTo(1);
    expect(tempoScore(track("a", { bpm: 75 }), track("b", { bpm: 150 }))).toBeCloseTo(1);
  });

  it("bottoms out for tempos with no relationship", () => {
    expect(tempoScore(track("a", { bpm: 120 }), track("b", { bpm: 100 }))).toBe(0);
  });

  it("stays neutral when a tempo is unknown rather than punishing it", () => {
    const neutral = tempoScore(track("a"), track("b", { bpm: 120 }));
    expect(neutral).toBeGreaterThan(0);
    expect(neutral).toBeLessThan(1);
  });
});

describe("keyScore", () => {
  it("ranks the Camelot wheel the way a DJ reads it", () => {
    const from = track("a", { camelotKey: "8A" });
    const same = keyScore(from, track("b", { camelotKey: "8A" }));
    const relative = keyScore(from, track("c", { camelotKey: "8B" }));
    const neighbour = keyScore(from, track("d", { camelotKey: "9A" }));
    const twoSteps = keyScore(from, track("e", { camelotKey: "10A" }));
    const unrelated = keyScore(from, track("f", { camelotKey: "3B" }));
    expect(same).toBeGreaterThan(relative);
    expect(relative).toBeGreaterThan(neighbour);
    expect(neighbour).toBeGreaterThan(twoSteps);
    expect(twoSteps).toBeGreaterThan(unrelated);
  });

  it("wraps around the wheel", () => {
    expect(keyScore(track("a", { camelotKey: "12A" }), track("b", { camelotKey: "1A" }))).toBe(
      keyScore(track("a", { camelotKey: "5A" }), track("b", { camelotKey: "6A" })),
    );
  });

  it("stays neutral for an unknown key", () => {
    expect(keyScore(track("a"), track("b", { camelotKey: "8A" }))).toBe(0.5);
  });
});

describe("trackEnergy", () => {
  it("reads the median of a track's own envelope", () => {
    expect(trackEnergy(track("a", { waveform: envelopeAt(0.6) }))).toBeCloseTo(0.6);
  });

  it("is null without a waveform", () => {
    expect(trackEnergy(track("a"))).toBeNull();
    expect(trackEnergy(undefined)).toBeNull();
  });

  it("ignores near-silence, so a track with a long quiet intro doesn't read as quiet", () => {
    const waveform = [...new Array(40).fill(0.01), ...new Array(60).fill(0.7)];
    expect(trackEnergy(track("a", { waveform }))).toBeCloseTo(0.7);
  });
});

describe("energyScore", () => {
  it("prefers a small climb to a big jump", () => {
    const from = track("a", { waveform: envelopeAt(0.5) });
    const gentle = energyScore(from, track("b", { waveform: envelopeAt(0.55) }));
    const jump = energyScore(from, track("c", { waveform: envelopeAt(0.95) }));
    expect(gentle).toBeGreaterThan(jump);
  });

  it("prefers a climb to a drop", () => {
    const from = track("a", { waveform: envelopeAt(0.5) });
    expect(energyScore(from, track("b", { waveform: envelopeAt(0.58) }))).toBeGreaterThan(
      energyScore(from, track("c", { waveform: envelopeAt(0.42) })),
    );
  });
});

describe("sequenceTracks", () => {
  it("returns short inputs untouched", () => {
    const analyses = new Map([["a", track("a", { bpm: 120 })]]);
    expect(sequenceTracks(["a"], analyses).order).toEqual(["a"]);
    expect(sequenceTracks([], analyses).order).toEqual([]);
  });

  it("keeps every track it was given, exactly once", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const analyses = new Map(
      ids.map((id, index) => [id, track(id, { bpm: 118 + index * 7, camelotKey: "8A" })]),
    );
    const { order } = sequenceTracks(ids, analyses);
    expect([...order].sort()).toEqual([...ids].sort());
  });

  it("orders a tempo ladder into a run rather than a jumble", () => {
    // Interleaved on purpose: the input order alternates slow and fast.
    const ids = ["slow1", "fast1", "slow2", "fast2", "slow3", "fast3"];
    const analyses = new Map([
      ["slow1", track("slow1", { bpm: 100, waveform: envelopeAt(0.4) })],
      ["slow2", track("slow2", { bpm: 102, waveform: envelopeAt(0.45) })],
      ["slow3", track("slow3", { bpm: 104, waveform: envelopeAt(0.5) })],
      ["fast1", track("fast1", { bpm: 128, waveform: envelopeAt(0.6) })],
      ["fast2", track("fast2", { bpm: 130, waveform: envelopeAt(0.65) })],
      ["fast3", track("fast3", { bpm: 132, waveform: envelopeAt(0.7) })],
    ]);
    const { order } = sequenceTracks(ids, analyses);

    // The two groups are 25% apart, so exactly one crossing between them is unavoidable in any
    // running order — but only one. The input order pays that cost at every single join.
    const unmixablePairs = (ids: string[]) => {
      let count = 0;
      for (let i = 0; i + 1 < ids.length; i++) {
        if (tempoScore(analyses.get(ids[i]), analyses.get(ids[i + 1])) === 0) count++;
      }
      return count;
    };
    expect(unmixablePairs(order)).toBe(1);
    expect(unmixablePairs(ids)).toBe(5);
    // ...and each group comes out as one contiguous run rather than interleaved.
    const isSlow = order.map((id) => id.startsWith("slow"));
    expect(isSlow.filter((slow, index) => index > 0 && slow !== isSlow[index - 1])).toHaveLength(1);
    expect(pathScore(order, analyses)).toBeGreaterThan(pathScore(ids, analyses));
  });

  it("beats the original order on a mixed set of tempos and keys", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const bpms = [128, 96, 129, 174, 127, 98, 130, 172];
    const keys = ["8A", "3B", "9A", "8A", "8B", "4B", "10A", "9A"];
    const analyses = new Map(
      ids.map((id, index) => [
        id,
        track(id, {
          bpm: bpms[index],
          camelotKey: keys[index],
          waveform: envelopeAt(0.4 + index * 0.05),
        }),
      ]),
    );
    const { order } = sequenceTracks(ids, analyses);
    expect(pathScore(order, analyses)).toBeGreaterThan(pathScore(ids, analyses));
  });

  it("opens on the lowest-energy track", () => {
    const ids = ["loud", "quiet", "middling"];
    const analyses = new Map([
      ["loud", track("loud", { bpm: 124, waveform: envelopeAt(0.9) })],
      ["quiet", track("quiet", { bpm: 124, waveform: envelopeAt(0.3) })],
      ["middling", track("middling", { bpm: 124, waveform: envelopeAt(0.6) })],
    ]);
    expect(sequenceTracks(ids, analyses).order[0]).toBe("quiet");
  });

  it("leaves unanalyzed tracks at the end, in the order they came in", () => {
    const ids = ["known1", "unknown1", "known2", "unknown2"];
    const analyses = new Map([
      ["known1", track("known1", { bpm: 124, camelotKey: "8A", waveform: envelopeAt(0.5) })],
      ["known2", track("known2", { bpm: 125, camelotKey: "9A", waveform: envelopeAt(0.55) })],
    ]);
    const { order, unsequenced } = sequenceTracks(ids, analyses);
    expect(order.slice(2)).toEqual(["unknown1", "unknown2"]);
    expect(unsequenced).toEqual(["unknown1", "unknown2"]);
  });

  it("handles a set where nothing has been analyzed", () => {
    const ids = ["a", "b", "c"];
    const { order, unsequenced } = sequenceTracks(ids, new Map());
    expect(order).toEqual(ids);
    expect(unsequenced).toEqual(ids);
  });

  it("stays fast on a large set", () => {
    const ids = Array.from({ length: 300 }, (_, index) => `t${index}`);
    const analyses = new Map(
      ids.map((id, index) => [
        id,
        track(id, {
          bpm: 90 + (index % 60),
          camelotKey: `${(index % 12) + 1}${index % 2 === 0 ? "A" : "B"}`,
          waveform: envelopeAt(0.3 + (index % 7) * 0.1),
        }),
      ]),
    );
    const started = Date.now();
    const { order } = sequenceTracks(ids, analyses);
    expect(order).toHaveLength(300);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("transitionScore", () => {
  it("rates a beatmatchable, harmonically compatible pair above a mismatched one", () => {
    const from = track("a", { bpm: 124, camelotKey: "8A", waveform: envelopeAt(0.5) });
    const good = track("b", { bpm: 125, camelotKey: "8B", waveform: envelopeAt(0.55) });
    const bad = track("c", { bpm: 101, camelotKey: "3B", waveform: envelopeAt(0.2) });
    expect(transitionScore(from, good)).toBeGreaterThan(transitionScore(from, bad));
  });
});

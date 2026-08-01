import { describe, expect, it } from "vitest";
import { gainForRms, representativeRms } from "@/lib/loudness";

describe("gainForRms", () => {
  it("turns a louder-than-target track down proportionally", () => {
    // Target 0.1, track at 0.2 (twice as loud) -> half volume.
    expect(gainForRms(0.2, 0.1)).toBeCloseTo(0.5);
  });

  it("boosts a quieter-than-target track up proportionally", () => {
    // Target 0.1, track at 0.05 (half as loud) -> double volume.
    expect(gainForRms(0.05, 0.1)).toBeCloseTo(2);
  });

  it("returns 1 exactly at the target", () => {
    expect(gainForRms(0.1, 0.1)).toBeCloseTo(1);
  });

  it("caps the boost for an extremely quiet track instead of amplifying it unboundedly", () => {
    const gain = gainForRms(0.0001, 0.1);
    expect(gain).toBeLessThanOrEqual(4);
    expect(gain).toBeGreaterThan(1);
  });

  it("treats true silence as harmless to (nominally) boost, not an error", () => {
    // 0 * any gain is still 0 — silence stays silent regardless of the multiplier chosen.
    expect(gainForRms(0)).toBeGreaterThan(1);
  });

  it("stays neutral (gain 1) for invalid readings rather than guessing a boost", () => {
    // NaN/negative means analysis failed — could just as easily be a loud track, so don't
    // amplify blindly.
    expect(gainForRms(NaN)).toBe(1);
    expect(gainForRms(-1)).toBe(1);
    expect(gainForRms(Infinity)).toBe(1);
  });
});

describe("representativeRms", () => {
  it("ignores a handful of near-silent windows (a quiet intro) when louder windows exist", () => {
    // A quiet intro (near-silent) followed by a normal-volume verse/chorus — the silent
    // windows must not drag the reading down toward "boost this a lot".
    const windows = [0.0005, 0.0005, 0.0005, 0.08, 0.09, 0.1, 0.09, 0.08];
    const rms = representativeRms(windows, 0.75, 0.01);
    expect(rms).toBeGreaterThan(0.05);
  });

  it("falls back to using every window when the whole track is near-silent", () => {
    // Nothing passes the silence gate — there's no "loud part" to prefer, so this must not
    // collapse to 0/empty and lose the reading entirely.
    const windows = [0.0005, 0.0006, 0.0004];
    const rms = representativeRms(windows, 0.75, 0.01);
    expect(rms).toBeGreaterThan(0);
    expect(rms).toBeLessThan(0.01);
  });

  it("returns 0 for an empty series rather than throwing", () => {
    expect(representativeRms([])).toBe(0);
  });

  it("isn't skewed by a single very loud outlier window", () => {
    // One transient spike among many typical-loudness windows — the 75th percentile should
    // land near the typical windows, not get pulled up toward the outlier.
    const typical = Array(20).fill(0.08);
    const withSpike = [...typical, 0.9];
    const rms = representativeRms(withSpike, 0.75, 0.01);
    expect(rms).toBeCloseTo(0.08, 2);
  });

  it("a higher percentile picks a louder representative window", () => {
    const windows = [0.02, 0.04, 0.06, 0.08, 0.1];
    const low = representativeRms(windows, 0.2, 0.01);
    const high = representativeRms(windows, 0.9, 0.01);
    expect(high).toBeGreaterThan(low);
  });
});

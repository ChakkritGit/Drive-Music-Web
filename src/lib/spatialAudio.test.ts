import { describe, expect, it } from "vitest";
import { clampSpatialIntensity, spatialGainsForIntensity } from "@/lib/spatialAudio";

describe("clampSpatialIntensity", () => {
  it("clamps to [0, 100]", () => {
    expect(clampSpatialIntensity(-10)).toBe(0);
    expect(clampSpatialIntensity(150)).toBe(100);
    expect(clampSpatialIntensity(50)).toBe(50);
  });
});

describe("spatialGainsForIntensity", () => {
  it("is fully dry with no wet signal when disabled, regardless of stored intensity", () => {
    expect(spatialGainsForIntensity(false, 100)).toEqual({ wet: 0, dry: 1 });
  });

  it("adds no wet signal and keeps dry at 1 when enabled at 0 intensity", () => {
    expect(spatialGainsForIntensity(true, 0)).toEqual({ wet: 0, dry: 1 });
  });

  it("scales wet up and dry down together as intensity increases", () => {
    const half = spatialGainsForIntensity(true, 50);
    const full = spatialGainsForIntensity(true, 100);
    expect(half.wet).toBeGreaterThan(0);
    expect(half.wet).toBeLessThan(full.wet);
    expect(half.dry).toBeLessThan(1);
    expect(half.dry).toBeGreaterThan(full.dry);
  });

  it("never pushes wet above 0.5 or dry below 0.75, even at max intensity", () => {
    const full = spatialGainsForIntensity(true, 100);
    expect(full.wet).toBeCloseTo(0.5);
    expect(full.dry).toBeCloseTo(0.75);
  });
});

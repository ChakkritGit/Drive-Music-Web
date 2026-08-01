import { describe, expect, it } from "vitest";
import { gainForRms } from "@/lib/loudness";

describe("gainForRms", () => {
  it("turns a louder-than-target track down proportionally", () => {
    // Target 0.1, track at 0.2 (twice as loud) -> half volume.
    expect(gainForRms(0.2, 0.1)).toBeCloseTo(0.5);
  });

  it("never boosts a quieter-than-target track above 1", () => {
    expect(gainForRms(0.02, 0.1)).toBe(1);
  });

  it("returns 1 exactly at the target", () => {
    expect(gainForRms(0.1, 0.1)).toBeCloseTo(1);
  });

  it("falls back to 1 for silence or invalid input", () => {
    expect(gainForRms(0)).toBe(1);
    expect(gainForRms(-1)).toBe(1);
    expect(gainForRms(NaN)).toBe(1);
  });

  it("never returns a gain above 1 even for an extremely quiet track", () => {
    expect(gainForRms(0.0001, 0.1)).toBe(1);
  });
});

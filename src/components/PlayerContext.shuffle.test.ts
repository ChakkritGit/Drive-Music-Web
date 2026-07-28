import { describe, expect, it } from "vitest";
import { weightedShuffledIndices } from "@/components/PlayerContext";

function isPermutationOf(order: number[], length: number): boolean {
  if (order.length !== length) return false;
  const seen = new Set(order);
  if (seen.size !== length) return false;
  for (let i = 0; i < length; i++) {
    if (!seen.has(i)) return false;
  }
  return true;
}

describe("weightedShuffledIndices", () => {
  it("always returns a full permutation of [0, length)", () => {
    for (let trial = 0; trial < 50; trial++) {
      const length = 10;
      const weights = Array.from({ length }, () => Math.random());
      const order = weightedShuffledIndices(length, 3, weights);
      expect(isPermutationOf(order, length)).toBe(true);
    }
  });

  it("always pins the given index first", () => {
    const weights = [0.9, 0.1, 0.5, 0.7, 0.2];
    for (let pinned = 0; pinned < weights.length; pinned++) {
      const order = weightedShuffledIndices(weights.length, pinned, weights);
      expect(order[0]).toBe(pinned);
    }
  });

  it("handles a single-track queue (length 1)", () => {
    const order = weightedShuffledIndices(1, 0, [1]);
    expect(order).toEqual([0]);
  });

  it("degrades to plain uniform shuffle when all weights are equal", () => {
    // With equal weights every permutation of the non-pinned indices should be
    // reachable — sample many times and check every non-pinned index appears in
    // every non-first position at least once (a weak but meaningful uniformity check).
    const length = 4;
    const weights = [1, 1, 1, 1];
    const positionCounts: Record<number, Set<number>> = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };
    for (let trial = 0; trial < 500; trial++) {
      const order = weightedShuffledIndices(length, 0, weights);
      order.forEach((value, position) => positionCounts[position].add(value));
    }
    for (let position = 1; position < length; position++) {
      expect(positionCounts[position].size).toBeGreaterThan(1);
    }
  });

  it("biases a heavily-weighted non-pinned track toward earlier positions", () => {
    const length = 5;
    const weights = [0.5, 100, 0.001, 0.001, 0.001]; // index 1 is dominant, index 0 is pinned
    let sumOfPositionsForIndex1 = 0;
    const trials = 500;
    for (let trial = 0; trial < trials; trial++) {
      const order = weightedShuffledIndices(length, 0, weights);
      sumOfPositionsForIndex1 += order.indexOf(1);
    }
    const averagePosition = sumOfPositionsForIndex1 / trials;
    // Pinned index 0 always occupies position 0, leaving positions 1..4 for the rest;
    // a dominant weight should average close to position 1, not the ~2.5 midpoint of
    // a uniform shuffle over the remaining 4 slots.
    expect(averagePosition).toBeLessThan(1.5);
  });

  it("falls back to weight 0.5 for an out-of-bounds/undefined weight entry", () => {
    // weights shorter than length — missing entries should not throw.
    const order = weightedShuffledIndices(4, 0, [0.5]);
    expect(isPermutationOf(order, 4)).toBe(true);
  });
});

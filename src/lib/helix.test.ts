import { describe, expect, it } from "vitest";
import {
  HELIX_BASE_RADIUS,
  HELIX_CENTER,
  HELIX_STRANDS,
  PRIMARY_AMPLITUDE,
  SECONDARY_AMPLITUDE,
  helixPath,
} from "@/lib/helix";

/** Every point the path visits, as [x, y]. */
function points(path: string): [number, number][] {
  return path
    .replace(/Z$/, "")
    .split(/(?=[ML])/)
    .filter(Boolean)
    .map((command) => {
      const [x, y] = command.slice(1).split(" ").map(Number);
      return [x, y] as [number, number];
    });
}

function radii(path: string): number[] {
  return points(path).map(([x, y]) => Math.hypot(x - HELIX_CENTER, y - HELIX_CENTER));
}

describe("helixPath", () => {
  it("is a closed loop starting with a move", () => {
    const path = helixPath(0, HELIX_STRANDS[0]);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.slice(1).includes("M")).toBe(false);
  });

  it("stays inside the box it's drawn in, at every phase", () => {
    // The sum of both amplitudes is the worst case, and it has to fit the 100-unit viewBox.
    const maximum = HELIX_BASE_RADIUS * (1 + PRIMARY_AMPLITUDE + SECONDARY_AMPLITUDE);
    expect(HELIX_CENTER + maximum).toBeLessThanOrEqual(100);
    for (const strand of HELIX_STRANDS) {
      for (const seconds of [0, 1.3, 7, 40, 1000]) {
        for (const radius of radii(helixPath(seconds, strand))) {
          expect(radius).toBeLessThanOrEqual(maximum + 0.01);
        }
      }
    }
  });

  it("swings both ways around the base radius rather than only outwards", () => {
    const values = radii(helixPath(0, HELIX_STRANDS[0]));
    expect(Math.max(...values)).toBeGreaterThan(HELIX_BASE_RADIUS);
    expect(Math.min(...values)).toBeLessThan(HELIX_BASE_RADIUS);
  });

  it("never produces a coordinate the renderer would choke on", () => {
    for (const strand of HELIX_STRANDS) {
      for (const [x, y] of points(helixPath(3.7, strand))) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });

  it("moves — the shape at one moment isn't the shape at the next", () => {
    const strand = HELIX_STRANDS[0];
    expect(helixPath(0, strand)).not.toBe(helixPath(0.2, strand));
  });

  it("never repeats itself, because the two waves' periods don't divide into each other", () => {
    const strand = HELIX_STRANDS[0];
    // One full turn of the primary wave (7s) leaves the secondary somewhere else entirely.
    expect(helixPath(0, strand)).not.toBe(helixPath(7, strand));
    expect(helixPath(0, strand)).not.toBe(helixPath(77, strand));
  });

  it("draws the two strands as different lines", () => {
    expect(helixPath(2, HELIX_STRANDS[0])).not.toBe(helixPath(2, HELIX_STRANDS[1]));
  });

  it("runs the two strands in opposite directions", () => {
    expect(HELIX_STRANDS[0].primarySpeed * HELIX_STRANDS[1].primarySpeed).toBeLessThan(0);
    expect(HELIX_STRANDS[0].secondarySpeed * HELIX_STRANDS[1].secondarySpeed).toBeLessThan(0);
  });
});

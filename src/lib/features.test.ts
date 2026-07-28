import { describe, expect, it } from "vitest";
import { extractFeatures, FEATURE_GROUPS, FEATURE_SIZE } from "@/lib/features";
import type { DriveFile, ParsedMetadata } from "@/types";

function file(id: string): DriveFile {
  return { id, name: `${id}.mp3`, mimeType: "audio/mpeg" };
}

function countOnes(features: number[]): number {
  return features.filter((v) => v === 1).length;
}

describe("FEATURE_SIZE / FEATURE_GROUPS", () => {
  it("FEATURE_GROUPS sizes sum to FEATURE_SIZE", () => {
    const total = FEATURE_GROUPS.reduce((sum, g) => sum + g.size, 0);
    expect(total).toBe(FEATURE_SIZE);
  });

  it("is 47 given the current bucket configuration (1 + 4 + 2 + 16 + 16 + 8)", () => {
    expect(FEATURE_SIZE).toBe(47);
  });
});

describe("extractFeatures", () => {
  it("returns a vector of exactly FEATURE_SIZE length", () => {
    const f = extractFeatures(file("a"), undefined, new Date());
    expect(f).toHaveLength(FEATURE_SIZE);
  });

  it("sets the bias feature (index 0) to 1", () => {
    const f = extractFeatures(file("a"), undefined, new Date());
    expect(f[0]).toBe(1);
  });

  it("is one-hot per group — exactly 6 ones total (bias + time + weekday + artist + album + track)", () => {
    const f = extractFeatures(file("a"), { artist: "Radiohead", album: "OK Computer" }, new Date());
    expect(countOnes(f)).toBe(6);
    expect(f.every((v) => v === 0 || v === 1)).toBe(true);
  });

  it("is deterministic — same inputs produce the identical vector", () => {
    const meta: ParsedMetadata = { artist: "Boris", album: "Flood" };
    const at = new Date(2026, 0, 15, 14, 30);
    const a = extractFeatures(file("track-1"), meta, at);
    const b = extractFeatures(file("track-1"), meta, at);
    expect(a).toEqual(b);
  });

  it("buckets night/morning/afternoon/evening hours distinctly at the boundaries", () => {
    const at = (hour: number) => new Date(2026, 0, 15, hour, 0);
    const bucketIndexOf = (hour: number) => {
      const f = extractFeatures(file("a"), undefined, at(hour));
      // time-of-day one-hot occupies indices [1, 5)
      return f.slice(1, 5).indexOf(1);
    };
    expect(bucketIndexOf(0)).toBe(0); // night
    expect(bucketIndexOf(5)).toBe(0); // night
    expect(bucketIndexOf(6)).toBe(1); // morning
    expect(bucketIndexOf(11)).toBe(1); // morning
    expect(bucketIndexOf(12)).toBe(2); // afternoon
    expect(bucketIndexOf(17)).toBe(2); // afternoon
    expect(bucketIndexOf(18)).toBe(3); // evening
    expect(bucketIndexOf(23)).toBe(3); // evening
  });

  it("buckets weekends separately from weekdays", () => {
    const weekdayIndexOf = (date: Date) => {
      const f = extractFeatures(file("a"), undefined, date);
      // weekday one-hot occupies indices [5, 7)
      return f.slice(5, 7).indexOf(1);
    };
    const sunday = new Date(2026, 0, 18); // a Sunday
    const saturday = new Date(2026, 0, 17); // a Saturday
    const wednesday = new Date(2026, 0, 14); // a Wednesday
    expect(weekdayIndexOf(sunday)).toBe(1);
    expect(weekdayIndexOf(saturday)).toBe(1);
    expect(weekdayIndexOf(wednesday)).toBe(0);
  });

  it("falls back gracefully to unknown-artist/unknown-album buckets when metadata is missing", () => {
    const withMeta = extractFeatures(file("x"), { artist: "unknown-artist", album: "unknown-album" }, new Date());
    const withoutMeta = extractFeatures(file("x"), undefined, new Date());
    expect(withoutMeta).toEqual(withMeta);
  });

  it("still produces a valid vector when the file id is an empty string", () => {
    const f = extractFeatures({ id: "", name: "n", mimeType: "audio/mpeg" }, undefined, new Date());
    expect(f).toHaveLength(FEATURE_SIZE);
    expect(countOnes(f)).toBe(6);
  });
});

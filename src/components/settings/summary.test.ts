import { describe, expect, it } from "vitest";
import { sectionSummary, type SummaryPlayer } from "./summary";

const base: SummaryPlayer = {
  gaplessEnabled: true,
  crossfadeEnabled: true,
  crossfadeSeconds: 4,
  autoMixEnabled: false,
  beatmatchEnabled: false,
  eqEnabled: true,
  spatialAudioEnabled: false,
  visualizerEnabled: true,
  cachedTracks: new Map(),
};

describe("sectionSummary", () => {
  it("appearance", () => {
    expect(sectionSummary("appearance", base)).toBe("Visualizer on");
    expect(sectionSummary("appearance", { ...base, visualizerEnabled: false })).toBe("Visualizer off");
  });
  it("playback", () => {
    expect(sectionSummary("playback", base)).toBe("Crossfade 4s · Gapless on");
    expect(sectionSummary("playback", { ...base, crossfadeEnabled: false, gaplessEnabled: false })).toBe(
      "Crossfade off · Gapless off",
    );
  });
  it("mixing", () => {
    expect(sectionSummary("mixing", base)).toBe("Auto mix off · Beatmatch off");
    expect(sectionSummary("mixing", { ...base, autoMixEnabled: true, beatmatchEnabled: true })).toBe(
      "Auto mix on · Beatmatch on",
    );
  });
  it("sound", () => {
    expect(sectionSummary("sound", base)).toBe("EQ on · Spatial off");
  });
  it("data, singular and plural", () => {
    const tracks = (n: number) => new Map(Array.from({ length: n }, (_, i) => [String(i), 0]));
    expect(sectionSummary("data", { ...base, cachedTracks: tracks(0) })).toBe("0 downloaded tracks");
    expect(sectionSummary("data", { ...base, cachedTracks: tracks(1) })).toBe("1 downloaded track");
    expect(sectionSummary("data", { ...base, cachedTracks: tracks(3) })).toBe("3 downloaded tracks");
  });
  it("unknown id falls back to empty", () => {
    expect(sectionSummary("nope", base)).toBe("");
  });
});

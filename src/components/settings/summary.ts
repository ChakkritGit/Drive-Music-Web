import type { usePlayer } from "@/components/PlayerContext";
import { findSection } from "./sections";

type Player = ReturnType<typeof usePlayer>;

export type SummaryPlayer = Pick<
  Player,
  | "gaplessEnabled"
  | "crossfadeEnabled"
  | "crossfadeSeconds"
  | "autoMixEnabled"
  | "beatmatchEnabled"
  | "eqEnabled"
  | "spatialAudioEnabled"
  | "visualizerEnabled"
> & { cachedTracks: { size: number } };

const onOff = (v: boolean) => (v ? "on" : "off");

// themeLabel is passed in: the theme lives in ThemeContext, not the player.
export function sectionSummary(id: string, p: SummaryPlayer, themeLabel?: string): string {
  switch (id) {
    case "appearance":
      if (themeLabel) return `${themeLabel} · Visualizer ${onOff(p.visualizerEnabled)}`;
      break;
    case "playback":
      return `${p.crossfadeEnabled ? `Crossfade ${p.crossfadeSeconds}s` : "Crossfade off"} · Gapless ${onOff(p.gaplessEnabled)}`;
    case "mixing":
      return `Auto mix ${onOff(p.autoMixEnabled)} · Beatmatch ${onOff(p.beatmatchEnabled)}`;
    case "sound":
      return `EQ ${onOff(p.eqEnabled)} · Spatial ${onOff(p.spatialAudioEnabled)}`;
    case "data": {
      const n = p.cachedTracks.size;
      return `${n} downloaded ${n === 1 ? "track" : "tracks"}`;
    }
  }
  return findSection(id)?.description ?? "";
}

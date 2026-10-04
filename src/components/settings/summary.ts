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

export function sectionSummary(id: string, p: SummaryPlayer): string {
  switch (id) {
    case "appearance":
      return `Visualizer ${onOff(p.visualizerEnabled)}`;
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

import type { ComponentType } from "react";
import { Database, Disc3, Palette, Play, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { AppearanceSettings } from "./AppearanceSettings";
import { DataSettings } from "./DataSettings";
import { MixingSettings } from "./MixingSettings";
import { PlaybackSettings } from "./PlaybackSettings";
import { SoundSettings } from "./SoundSettings";

export type SettingsSectionId = "appearance" | "playback" | "mixing" | "sound" | "data";

export const SETTINGS_SECTIONS: {
  id: SettingsSectionId;
  title: string;
  description: string;
  icon: LucideIcon;
  Component: ComponentType;
}[] = [
  { id: "appearance", title: "Appearance", description: "Visualizer and display", icon: Palette, Component: AppearanceSettings },
  { id: "playback", title: "Playback", description: "Gapless, crossfade, loudness", icon: Play, Component: PlaybackSettings },
  { id: "mixing", title: "Mixing", description: "Auto mix and beatmatching", icon: Disc3, Component: MixingSettings },
  { id: "sound", title: "Sound", description: "Equalizer and spatial audio", icon: SlidersHorizontal, Component: SoundSettings },
  { id: "data", title: "Data", description: "Downloads, history and reset", icon: Database, Component: DataSettings },
];

export function findSection(id: string) {
  return SETTINGS_SECTIONS.find((s) => s.id === id);
}

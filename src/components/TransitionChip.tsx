"use client";

import { useState } from "react";
import { ChevronRight, SlidersHorizontal, Sparkles } from "lucide-react";
import type { DriveFile } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { TransitionEditor } from "@/components/TransitionEditor";
import { PRESET_LABELS, isAutoTransition, matchingPreset } from "@/lib/transition";

/**
 * The small "Auto ›" control that sits *between* two track rows, showing how one will blend into
 * the next and opening the editor for it.
 *
 * The placement matters as much as the label: a transition belongs to a *pair* of tracks, and a
 * control living inside either row would imply it belongs to that one. The tempo and key beside
 * it are the two facts that decide whether the transition can work at all, so they're read
 * together with it rather than crowded into the row above.
 *
 * Only shown when mixing is actually on: with crossfade off every transition is a hard cut, and
 * there is nothing here to configure.
 */
export function TransitionChip({ from, to }: { from: DriveFile; to: DriveFile }) {
  const { crossfadeEnabled, autoMixEnabled, getTransition, analyses } = usePlayer();
  const [isEditing, setIsEditing] = useState(false);

  if (!crossfadeEnabled || !autoMixEnabled) return null;

  const settings = getTransition(from.id, to.id);
  const isAuto = isAutoTransition(settings);
  const analysis = analyses.get(from.id);

  return (
    // The vertical rule replaces the list's own separator between these two rows — a hairline
    // plus a chip draws the same boundary twice, and the chip is the one that says something.
    <div className="mt-1.5 flex items-center gap-2.5 pl-[52px]">
      <span className="h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-800" />
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {isAuto ? (
          <Sparkles className="h-3 w-3 text-accent" />
        ) : (
          <SlidersHorizontal className="h-3 w-3" />
        )}
        {describe(settings.shape ? matchingPreset(settings.shape) : null, isAuto, settings.bars)}
        <ChevronRight className="h-3 w-3 text-zinc-400" />
      </button>
      {analysis && (
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          {analysis.bpm !== undefined && (
            <span className="tabular-nums">{Math.round(analysis.bpm)} BPM</span>
          )}
          {analysis.camelotKey && <span className="text-accent">{analysis.camelotKey}</span>}
        </span>
      )}
      {isEditing && (
        <TransitionEditor from={from} to={to} onClose={() => setIsEditing(false)} />
      )}
    </div>
  );
}

/** "Auto" until the user overrides something, then the shortest honest description of what they
 * chose — the preset's name plus the length, since those are what change the sound. A shape that
 * matches no preset is "Custom": they've adjusted individual lanes. */
function describe(
  preset: ReturnType<typeof matchingPreset>,
  isAuto: boolean,
  bars: number | undefined,
): string {
  if (isAuto) return "Auto";
  const name = preset ? PRESET_LABELS[preset] : "Custom";
  return bars === undefined ? name : `${name} · ${bars}`;
}

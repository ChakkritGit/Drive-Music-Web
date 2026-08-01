"use client";

import { Loader2 } from "lucide-react";
import { usePlayer } from "@/components/PlayerContext";

/** A small floating status badge, visible app-wide, while volume-normalization analysis is
 * running in the background (see analyzeAllLoudness in PlayerContext) — otherwise renders
 * nothing. Sits above the mini player / bottom nav rather than at the screen edge so it never
 * overlaps them. */
export function LoudnessAnalysisIndicator() {
  const { analyzeProgress } = usePlayer();
  if (!analyzeProgress) return null;

  const pct = Math.round((analyzeProgress.done / analyzeProgress.total) * 100);

  return (
    <div className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] left-4 z-40 flex items-center gap-2 rounded-full bg-zinc-900/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur dark:bg-zinc-100/90 dark:text-zinc-900">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Adjusting volume… {pct}%
    </div>
  );
}

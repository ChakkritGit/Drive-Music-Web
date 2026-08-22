"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import clsx from "clsx";
import type { DriveFile, PlaySource, TrackAnalysis } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { useToast } from "@/components/ToastContext";
import { sequenceTracks } from "@/lib/sequence";

/**
 * "Auto mix set" — orders a collection so each track runs into the next, then plays it.
 *
 * Non-destructive by design: this builds a *queue*, it never rewrites the playlist. The order a
 * set wants to be played in and the order its owner filed it in are two different things, and
 * only one of them is worth keeping.
 *
 * Analysis is the slow half. Whatever is downloaded and unanalyzed gets analyzed first, with a
 * count, because the alternative — sequencing on whatever happened to be cached — silently
 * produces a worse order than the button appears to promise.
 */
export function SequenceMixButton({
  files,
  source,
  className,
}: {
  files: DriveFile[];
  source?: PlaySource;
  className?: string;
}) {
  const {
    analyses,
    ensureAnalysis,
    play,
    crossfadeEnabled,
    setCrossfadeEnabled,
    autoMixEnabled,
    setAutoMixEnabled,
  } = usePlayer();
  const { showToast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Two tracks are a transition; one is not a set.
  if (files.length < 2) return null;

  const run = async () => {
    if (progress) return;

    // Start from what's already known and fill in the rest, rather than re-reading `analyses`
    // after each await — that map is a render's snapshot and would be stale by the second track.
    const known = new Map<string, TrackAnalysis>();
    for (const file of files) {
      const analysis = analyses.get(file.id);
      if (analysis) known.set(file.id, analysis);
    }

    const pending = files.filter((file) => !known.has(file.id));
    setProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      // Returns null for a track that isn't downloaded — analysis reads the decoded file, and
      // pulling a whole playlist down just to sort it isn't a decision this button gets to make.
      const analysis = await ensureAnalysis(pending[i]);
      if (analysis) known.set(pending[i].id, analysis);
      setProgress({ done: i + 1, total: pending.length });
    }
    setProgress(null);

    const byId = new Map(files.map((file) => [file.id, file]));
    const { order, unsequenced } = sequenceTracks(
      files.map((file) => file.id),
      known,
    );
    const queue = order.map((id) => byId.get(id)).filter((file): file is DriveFile => !!file);
    if (queue.length === 0) return;

    // The button promises mixed transitions; delivering hard cuts because two settings happen to
    // be off would read as it not working. Turned on rather than warned about, and said out loud
    // so it's clear where the change came from.
    const turnedOn = !crossfadeEnabled || !autoMixEnabled;
    if (!crossfadeEnabled) setCrossfadeEnabled(true);
    if (!autoMixEnabled) setAutoMixEnabled(true);

    play(queue, 0, source);

    const sequenced = queue.length - unsequenced.length;
    const parts = [`Mixed set of ${sequenced} track${sequenced === 1 ? "" : "s"}`];
    if (unsequenced.length > 0) parts.push(`${unsequenced.length} not analyzed, left at the end`);
    if (turnedOn) parts.push("auto mix on");
    showToast(parts.join(" · "));
  };

  return (
    <button
      onClick={() => void run()}
      disabled={progress !== null}
      className={clsx(
        // No margin of its own: this sits in a row beside Download all in one place and beside
        // Shuffle play in another, and the two rows space themselves differently.
        "flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition active:scale-95 hover:bg-zinc-50 disabled:active:scale-100 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900",
        className,
      )}
    >
      {progress ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing… {progress.done}/{progress.total}
        </>
      ) : (
        <>
          <Wand2 className="h-3.5 w-3.5 text-accent" />
          Auto mix set
        </>
      )}
    </button>
  );
}

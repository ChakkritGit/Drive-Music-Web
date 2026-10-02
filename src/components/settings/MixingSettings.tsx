"use client";

import { usePlayer } from "@/components/PlayerContext";

export function MixingSettings() {
  const {
    crossfadeEnabled,
    autoMixEnabled,
    setAutoMixEnabled,
    beatmatchEnabled,
    setBeatmatchEnabled,
    autoAnalyzeEnabled,
    setAutoAnalyzeEnabled,
    trackAnalysisProgress,
    analyzeAllTracks,
    analyses,
    cachedTracks,
  } = usePlayer();

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Auto mix</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Turns each crossfade into a DJ-style mix: the outgoing track is filtered down
              and washed out while the incoming one opens up underneath, their bass swapped
              so only one owns the low end. Started on a bar line at the outgoing track&apos;s
              outro rather than after it.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoMixEnabled}
            disabled={!crossfadeEnabled}
            onClick={() => setAutoMixEnabled(!autoMixEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors disabled:opacity-40 ${
              autoMixEnabled
                ? "bg-accent ring-accent"
                : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                autoMixEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className={`mt-5 flex items-center justify-between gap-4 ${autoMixEnabled ? "" : "opacity-40"}`}>
          <div>
            <h3 className="text-sm text-zinc-900 dark:text-zinc-50">Beatmatching</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Nudges the incoming track&apos;s tempo to match the outgoing one across the mix.
              Only ever applies when both tempos are known and within 6% of each other —
              further apart than that, the stretch is audible and the two don&apos;t belong
              beat-matched anyway.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={beatmatchEnabled}
            disabled={!autoMixEnabled || !crossfadeEnabled}
            onClick={() => setBeatmatchEnabled(!beatmatchEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors disabled:opacity-40 ${
              beatmatchEnabled
                ? "bg-accent ring-accent"
                : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                beatmatchEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm text-zinc-900 dark:text-zinc-50">Analyze the whole library</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Works out tempo, key, waveform and mix points for every downloaded track ahead
              of time, so the chips between rows are filled in before you open them. Off by
              default: it&apos;s minutes of CPU across a large library, and whatever is about
              to play is analyzed on demand regardless.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoAnalyzeEnabled}
            onClick={() => setAutoAnalyzeEnabled(!autoAnalyzeEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
              autoAnalyzeEnabled
                ? "bg-accent ring-accent"
                : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                autoAnalyzeEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void analyzeAllTracks()}
            disabled={trackAnalysisProgress !== null || cachedTracks.size === 0}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {trackAnalysisProgress
              ? `Analyzing ${trackAnalysisProgress.done}/${trackAnalysisProgress.total}…`
              : "Analyze now"}
          </button>
          <span className="text-[11px] text-zinc-400">
            {analyses.size} of {cachedTracks.size} downloaded tracks analyzed
          </span>
        </div>

        <p className="mt-4 text-[11px] text-zinc-400">
          Needs Crossfade on: auto mix changes what a crossfade *is*, so with crossfade off
          every transition is a hard cut and there&apos;s nothing to shape. Per-pair
          adjustments live on the chip between two tracks in any list.
        </p>
      </section>
    </>
  );
}

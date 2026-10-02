"use client";

import { usePlayer, MAX_CROSSFADE_SECONDS } from "@/components/PlayerContext";

export function PlaybackSettings() {
  const {
    gaplessEnabled,
    setGaplessEnabled,
    crossfadeEnabled,
    crossfadeSeconds,
    setCrossfadeEnabled,
    setCrossfadeSeconds,
    volumeNormalizationEnabled,
    setVolumeNormalizationEnabled,
  } = usePlayer();

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Gapless playback
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Decode the next track while the current one is still playing, so albums and
              live sets run straight through with no silence at the join.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={gaplessEnabled}
            onClick={() => setGaplessEnabled(!gaplessEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
              gaplessEnabled
                ? "bg-accent ring-accent"
                : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                gaplessEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <p className="mt-4 text-[11px] text-zinc-400">
          Applies to tracks that are already downloaded. Crossfade takes over the join when
          it&apos;s switched on below, so the two never fight over the same transition.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Crossfade
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Smoothly blend the end of a track into the next one, instead of cutting
              straight across.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={crossfadeEnabled}
            onClick={() => setCrossfadeEnabled(!crossfadeEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
              crossfadeEnabled
                ? "bg-accent ring-accent"
                : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                crossfadeEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className={crossfadeEnabled ? "mt-5" : "mt-5 opacity-40"}>
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Crossfade length</span>
            <span className="tabular-nums">{crossfadeSeconds.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={MAX_CROSSFADE_SECONDS}
            step={0.5}
            value={crossfadeSeconds}
            disabled={!crossfadeEnabled}
            onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
            className="w-full accent-accent disabled:cursor-not-allowed"
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
            <span>0s</span>
            <span>{MAX_CROSSFADE_SECONDS}s</span>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-zinc-400">
          The next track is downloaded and decoded ahead of the join, so a transition into one
          you haven&apos;t played before still fades properly instead of cutting short. If that
          preparation doesn&apos;t finish in time, the join plays as a straight cut.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Volume normalization
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Evens out loudness across tracks — quiet ones get boosted, loud ones get turned
              down — so nothing suddenly blasts or gets lost after switching songs.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={volumeNormalizationEnabled}
            onClick={() => setVolumeNormalizationEnabled(!volumeNormalizationEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
              volumeNormalizationEnabled
                ? "bg-accent ring-accent"
                : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                volumeNormalizationEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <p className="mt-4 text-[11px] text-zinc-400">
          Each track is analyzed once in the background the first time it&apos;s downloaded
          (or played), then remembered — no delay on tracks you&apos;ve already listened to
          before.
        </p>
      </section>
    </>
  );
}

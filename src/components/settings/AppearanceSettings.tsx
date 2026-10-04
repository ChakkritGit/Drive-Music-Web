"use client";

import { usePlayer } from "@/components/PlayerContext";

export function AppearanceSettings() {
  const { visualizerEnabled, setVisualizerEnabled } = usePlayer();

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              Now Playing visualizer
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              The glow behind the album art reacts to the music instead of pulsing on a fixed
              timer.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={visualizerEnabled}
            onClick={() => setVisualizerEnabled(!visualizerEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
              visualizerEnabled
                ? "bg-accent ring-accent"
                : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                visualizerEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </section>
    </>
  );
}

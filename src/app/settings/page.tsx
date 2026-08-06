"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import { SignInScreen } from "@/components/SignInScreen";
import { usePlayer, MAX_CROSSFADE_SECONDS, MAX_EQ_GAIN_DB } from "@/components/PlayerContext";
import { clearAllData } from "@/lib/db";
import { MAX_SPATIAL_INTENSITY } from "@/lib/spatialAudio";

export default function SettingsPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return <SettingsView />;
}

function SettingsView() {
  const {
    gaplessEnabled,
    setGaplessEnabled,
    crossfadeEnabled,
    crossfadeSeconds,
    setCrossfadeEnabled,
    setCrossfadeSeconds,
    volumeNormalizationEnabled,
    setVolumeNormalizationEnabled,
    eqEnabled,
    eqBass,
    eqMid,
    eqTreble,
    setEqEnabled,
    setEqBass,
    setEqMid,
    setEqTreble,
    visualizerEnabled,
    setVisualizerEnabled,
    spatialAudioEnabled,
    spatialAudioIntensity,
    setSpatialAudioEnabled,
    setSpatialAudioIntensity,
  } = usePlayer();
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleClearAllData() {
    setClearing(true);
    try {
      await clearAllData();
    } finally {
      // Everything this app keeps (downloaded tracks, playlists, model, in-memory queue,
      // sync device identity, ...) lives in state above the router or in IndexedDB — a full
      // reload is the only way to guarantee nothing stale is still sitting in memory
      // afterward, rather than trying to reset every provider's state by hand.
      window.location.href = "/";
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="truncate text-center text-base font-medium text-zinc-900 sm:text-lg dark:text-zinc-50">
            Settings
          </h1>
          <div className="w-[4.5rem]" />
        </div>

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
                  ? "bg-emerald-500 ring-emerald-500"
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
                  ? "bg-emerald-500 ring-emerald-500"
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
              className="w-full accent-zinc-900 disabled:cursor-not-allowed dark:accent-zinc-100"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>0s</span>
              <span>{MAX_CROSSFADE_SECONDS}s</span>
            </div>
          </div>

          <p className="mt-4 text-[11px] text-zinc-400">
            Only kicks in between tracks that are already downloaded — an automatic transition
            to a track that still needs to download plays normally instead of cutting the fade
            short.
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
                  ? "bg-emerald-500 ring-emerald-500"
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

        <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Equalizer
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Shape bass, mid, and treble to taste.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={eqEnabled}
              onClick={() => setEqEnabled(!eqEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
                eqEnabled
                  ? "bg-emerald-500 ring-emerald-500"
                  : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  eqEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className={`space-y-4 ${eqEnabled ? "mt-5" : "mt-5 opacity-40"}`}>
            <EqBandSlider label="Bass" value={eqBass} onChange={setEqBass} disabled={!eqEnabled} />
            <EqBandSlider label="Mid" value={eqMid} onChange={setEqMid} disabled={!eqEnabled} />
            <EqBandSlider
              label="Treble"
              value={eqTreble}
              onChange={setEqTreble}
              disabled={!eqEnabled}
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Spatial audio
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Adds a sense of width and space to stereo tracks. Not true 3D positioning — a
                finished stereo mix has nothing to place in space — but blends in a
                convolution-based widening effect.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={spatialAudioEnabled}
              onClick={() => setSpatialAudioEnabled(!spatialAudioEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors ${
                spatialAudioEnabled
                  ? "bg-emerald-500 ring-emerald-500"
                  : "bg-zinc-100 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  spatialAudioEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className={spatialAudioEnabled ? "mt-5" : "mt-5 opacity-40"}>
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>Intensity</span>
              <span className="tabular-nums">{spatialAudioIntensity.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={MAX_SPATIAL_INTENSITY}
              step={1}
              value={spatialAudioIntensity}
              disabled={!spatialAudioEnabled}
              onChange={(e) => setSpatialAudioIntensity(Number(e.target.value))}
              className="w-full accent-zinc-900 disabled:cursor-not-allowed dark:accent-zinc-100"
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
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
                  ? "bg-emerald-500 ring-emerald-500"
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

        <section className="mt-6 rounded-2xl border border-red-200 p-5 dark:border-red-900/60">
          <h2 className="text-sm font-medium text-red-600 dark:text-red-400">Danger zone</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Permanently delete everything this app has stored on this device — downloaded
            tracks, playlists, your listening history and recommendation model, and playback
            settings. This doesn&apos;t sign you out of Google.
          </p>
          <button
            onClick={() => setShowConfirmClear(true)}
            className="mt-4 flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" /> Clear all data
          </button>
        </section>
      </div>

      {showConfirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => !clearing && setShowConfirmClear(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-base font-semibold">Clear all data?</h3>
            </div>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              This permanently deletes downloaded tracks, playlists (including Favorites),
              your listening history and recommendation model, recently played, and playback
              settings from this device. This can&apos;t be undone. You&apos;ll stay signed in.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowConfirmClear(false)}
                disabled={clearing}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllData}
                disabled={clearing}
                className="rounded-full bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {clearing ? "Clearing…" : "Clear everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EqBandSlider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums">
          {value > 0 ? "+" : ""}
          {value.toFixed(0)}dB
        </span>
      </div>
      <input
        type="range"
        min={-MAX_EQ_GAIN_DB}
        max={MAX_EQ_GAIN_DB}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-zinc-900 disabled:cursor-not-allowed dark:accent-zinc-100"
      />
    </div>
  );
}

"use client";

import { usePlayer, MAX_EQ_GAIN_DB } from "@/components/PlayerContext";
import { MAX_SPATIAL_INTENSITY } from "@/lib/spatialAudio";

export function SoundSettings() {
  const {
    eqEnabled,
    eqBass,
    eqMid,
    eqTreble,
    setEqEnabled,
    setEqBass,
    setEqMid,
    setEqTreble,
    spatialAudioEnabled,
    spatialAudioIntensity,
    setSpatialAudioEnabled,
    setSpatialAudioIntensity,
  } = usePlayer();

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
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
                ? "bg-accent ring-accent"
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
                ? "bg-accent ring-accent"
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
            className="w-full accent-accent disabled:cursor-not-allowed"
          />
        </div>
      </section>
    </>
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
        className="w-full accent-accent disabled:cursor-not-allowed"
      />
    </div>
  );
}

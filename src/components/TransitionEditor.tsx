"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Square, X } from "lucide-react";
import clsx from "clsx";
import type { DriveFile } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { WaveformWindow } from "@/components/WaveformWindow";
import { keysAreCompatible } from "@/lib/analysis";
import {
  BAR_OPTIONS,
  EQUAL_POWER_DOWN,
  EQUAL_POWER_UP,
  PRESET_LABELS,
  TRANSITION_PRESETS,
  constantCurve,
  curve,
  curveValue,
  curvesEqual,
  isConstantCurve,
  matchingPreset,
  presetShape,
  rampCurve,
  type TransitionLooping,
  type TransitionPreset,
  type TransitionSettings,
  type TransitionShape,
} from "@/lib/transition";

interface TransitionEditorProps {
  from: DriveFile;
  to: DriveFile;
  onClose: () => void;
}

/**
 * Editor for a single track-to-track transition: the two waveforms with their mix points, a row
 * of presets, the automation lanes, transition length in bars, and beatmatching.
 *
 * Every control here maps onto a real lane in TransitionShape, which the ramp loop reads
 * directly — there is nothing on this screen that doesn't change what comes out of the speakers.
 * Picking a preset fills all the lanes at once; changing any single lane afterwards leaves a
 * shape that no longer matches a preset, and the picker says "Custom".
 *
 * Every edit writes straight through to the store rather than on close: there's no Cancel here,
 * so a change the user can hear take effect should already be saved.
 */
export function TransitionEditor({ from, to, onClose }: TransitionEditorProps) {
  const {
    analyses,
    ensureAnalysis,
    getTransition,
    setTransition,
    autoMixEnabled,
    beatmatchEnabled,
    crossfadeSeconds,
    isPreviewingTransition,
    previewTransition,
    stopTransitionPreview,
  } = usePlayer();

  const [settings, setSettings] = useState<TransitionSettings>(() => getTransition(from.id, to.id));
  const [analysisSettled, setAnalysisSettled] = useState(false);

  const fromAnalysis = analyses.get(from.id) ?? null;
  const toAnalysis = analyses.get(to.id) ?? null;

  // This screen is the one place where waiting seconds for analysis is reasonable — the user
  // came here specifically to see and adjust what the analysis produced. Both tracks are
  // analyzed together; the editor stays usable throughout, just with empty waveforms.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([ensureAnalysis(from), ensureAnalysis(to)]).then(() => {
      if (!cancelled) setAnalysisSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [from, to, ensureAnalysis]);

  // Settled *and* still missing means the track defeated analysis (or isn't downloaded), which
  // the waveforms say for themselves — no point claiming work is still happening.
  const isAnalyzing = !analysisSettled;

  // A preview is tied to this screen; leaving it running after the editor closes would leave
  // the user with audio they have no way to stop.
  useEffect(() => stopTransitionPreview, [stopTransitionPreview]);

  const save = useCallback(
    (next: TransitionSettings) => {
      setSettings(next);
      void setTransition(from.id, to.id, next);
    },
    [from.id, to.id, setTransition],
  );

  /** The shape currently in effect — the user's own if they've made one, otherwise whatever the
   * app would pick. Every lane reads and writes through this, so editing a single lane of an
   * un-overridden transition starts from the shape they were actually hearing. */
  const effectiveShape = useMemo(
    () => settings.shape ?? presetShape(autoMixEnabled ? "mix" : "fade"),
    [settings.shape, autoMixEnabled],
  );

  const updateShape = useCallback(
    (transform: (shape: TransitionShape) => TransitionShape) => {
      save({ ...settings, shape: transform(effectiveShape) });
    },
    [save, settings, effectiveShape],
  );

  const currentPreset = settings.shape ? matchingPreset(settings.shape) : null;
  const hasTempo = fromAnalysis?.bpm !== undefined && toAnalysis?.bpm !== undefined;

  const outgoingStart =
    settings.outgoingStartSeconds ??
    Math.max(0, (fromAnalysis?.mixOutSeconds ?? (fromAnalysis?.durationSeconds ?? 0)) - estimatedSeconds(settings, fromAnalysis?.bpm, crossfadeSeconds));
  const incomingStart =
    settings.incomingStartSeconds ?? toAnalysis?.mixInSeconds ?? toAnalysis?.firstBeatSeconds ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-zinc-900 sm:rounded-2xl sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{trackName(from)}</h2>
            <p className="truncate text-xs text-zinc-400">into {trackName(to)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Done"
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Outgoing above, incoming below, each scrolling under its own centre line. The lines
            mean the same thing on both rows — "the mix starts here" — so lining a section up on
            the top row and a downbeat on the bottom one states directly how the two should meet. */}
        <div className="mt-4 space-y-2">
          <WaveformWindow
            label="Mix out"
            samples={fromAnalysis?.waveform ?? []}
            duration={fromAnalysis?.durationSeconds ?? 0}
            position={outgoingStart}
            onScrub={(seconds) => setSettings((prev) => ({ ...prev, outgoingStartSeconds: seconds }))}
            onScrubEnd={() => save(settings)}
          />
          <WaveformWindow
            label="Mix in"
            samples={toAnalysis?.waveform ?? []}
            duration={toAnalysis?.durationSeconds ?? 0}
            position={incomingStart}
            onScrub={(seconds) => setSettings((prev) => ({ ...prev, incomingStartSeconds: seconds }))}
            onScrubEnd={() => save(settings)}
          />
        </div>

        <p className="mt-2 text-xs text-zinc-400">
          Drag each track under its line to set where the mix starts.
        </p>
        <div className="mt-1 space-y-0.5 text-xs text-zinc-400">
          {isAnalyzing && <p>Analyzing…</p>}
          <p>
            {hasTempo
              ? `${Math.round(fromAnalysis!.bpm!)} → ${Math.round(toAnalysis!.bpm!)} BPM`
              : "Tempo unknown — transitions won't be beat-aligned."}
          </p>
          {fromAnalysis?.spectralCutoffHz !== undefined && (
            <p>Spectrum reaches {Math.round(fromAnalysis.spectralCutoffHz / 1000)} kHz</p>
          )}
          {fromAnalysis?.camelotKey && toAnalysis?.camelotKey && (
            <p>
              {keysAreCompatible(fromAnalysis.camelotKey, toAnalysis.camelotKey)
                ? `Keys ${fromAnalysis.camelotKey} → ${toAnalysis.camelotKey} are compatible.`
                : `Keys ${fromAnalysis.camelotKey} → ${toAnalysis.camelotKey} may clash.`}
            </p>
          )}
        </div>

        {/* Auditions the transition through the real audio graph — same filters, same ramp,
            same everything playback would use. */}
        <button
          onClick={() => {
            if (isPreviewingTransition) stopTransitionPreview();
            else void previewTransition(from, to, settings);
          }}
          className="mt-4 flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
        >
          {isPreviewingTransition ? (
            <>
              <Square className="h-3.5 w-3.5" /> Stop preview
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> Preview transition
            </>
          )}
        </button>

        <Section title="Preset">
          <Segmented
            options={[
              { value: "auto" as const, label: "Auto" },
              ...TRANSITION_PRESETS.map((preset) => ({ value: preset, label: PRESET_LABELS[preset] })),
            ]}
            value={settings.shape ? (currentPreset ?? "custom") : "auto"}
            onChange={(value) => {
              // Clearing back to Auto drops the whole override, not just the preset — the lanes
              // came from it, and keeping them while claiming "Auto" would be a lie.
              save({
                ...settings,
                shape: value === "auto" ? undefined : presetShape(value as TransitionPreset),
              });
            }}
          />
          {settings.shape && currentPreset === null && (
            <p className="mt-2 text-xs text-zinc-400">Custom — one or more lanes were adjusted.</p>
          )}
        </Section>

        {/* The five lanes. Each is a small set of named shapes rather than a free curve editor —
            dragging keyframes is a worse way to reach the handful of results anyone actually
            wants, and every option here writes real keyframes into the same TransitionShape a
            preset would. */}
        <Section title="Automation">
          <div className="space-y-2">
            <LaneSelect
              label="Volume"
              value={volumeLaneOf(effectiveShape)}
              options={[
                { value: "overlap", label: "Overlap" },
                { value: "equalPower", label: "Equal power" },
                { value: "linear", label: "Linear" },
              ]}
              onChange={(lane) => updateShape((shape) => withVolumeLane(shape, lane as VolumeLane))}
            />
            <LaneSelect
              label="EQ"
              value={eqLaneOf(effectiveShape)}
              options={[
                { value: "none", label: "None" },
                { value: "bassSwap", label: "Bass swap" },
                { value: "endBassSwap", label: "End bass swap" },
              ]}
              onChange={(lane) => updateShape((shape) => withEqLane(shape, lane as EqLane))}
            />
            <LaneSelect
              label="Filter"
              value={filterLaneOf(effectiveShape)}
              options={[
                { value: "none", label: "None" },
                { value: "highPassIn", label: "High pass in" },
                { value: "both", label: "Low pass out, high pass in" },
              ]}
              onChange={(lane) => updateShape((shape) => withFilterLane(shape, lane as FilterLane))}
            />
            <LaneSelect
              label="Effects"
              value={isConstantCurve(effectiveShape.outgoingReverb) ? "none" : "wash"}
              options={[
                { value: "none", label: "None" },
                { value: "wash", label: "Reverb wash" },
              ]}
              onChange={(lane) =>
                updateShape((shape) => ({
                  ...shape,
                  outgoingReverb: lane === "wash" ? rampCurve(0, 80) : constantCurve(0),
                }))
              }
            />
            <LaneSelect
              label="Looping"
              value={effectiveShape.looping}
              disabled={!hasTempo}
              options={[
                { value: "none", label: "None" },
                { value: "outgoingOneBar", label: "1 bar" },
                { value: "outgoingTwoBars", label: "2 bars" },
              ]}
              onChange={(lane) =>
                updateShape((shape) => ({ ...shape, looping: lane as TransitionLooping }))
              }
            />
          </div>
        </Section>

        <Section title="Length">
          <Segmented
            options={[
              { value: "auto" as const, label: "Auto" },
              ...BAR_OPTIONS.map((bars) => ({ value: String(bars), label: `${bars}` })),
            ]}
            value={settings.bars === undefined ? "auto" : String(settings.bars)}
            disabled={!hasTempo}
            onChange={(value) =>
              save({ ...settings, bars: value === "auto" ? undefined : Number(value) })
            }
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm">Beatmatching</span>
            <button
              role="switch"
              aria-checked={settings.beatmatchEnabled ?? beatmatchEnabled}
              disabled={!hasTempo}
              onClick={() =>
                save({ ...settings, beatmatchEnabled: !(settings.beatmatchEnabled ?? beatmatchEnabled) })
              }
              className={clsx(
                "relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40",
                settings.beatmatchEnabled ?? beatmatchEnabled
                  ? "bg-accent"
                  : "bg-zinc-200 dark:bg-zinc-700",
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition",
                  (settings.beatmatchEnabled ?? beatmatchEnabled) ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>
          {/* Tempo is what bars and beatmatching are both measured against — with neither track
              analyzed there is nothing to match to, and offering the controls anyway would
              promise something the engine can't deliver. */}
          {!hasTempo && (
            <p className="mt-2 text-xs text-zinc-400">
              Analyze both tracks to set the length in bars or match their tempo.
            </p>
          )}
        </Section>

        <div className="mt-5 flex flex-wrap gap-2">
          {(settings.outgoingStartSeconds !== undefined ||
            settings.incomingStartSeconds !== undefined) && (
            <button
              onClick={() =>
                save({
                  ...settings,
                  outgoingStartSeconds: undefined,
                  incomingStartSeconds: undefined,
                })
              }
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Reset start points
            </button>
          )}
          <button
            onClick={() => save({})}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Reset to Auto
          </button>
        </div>
      </div>
    </div>
  );
}

/** How long the transition will run, used only to place the default outgoing marker. */
function estimatedSeconds(
  settings: TransitionSettings,
  bpm: number | undefined,
  fallbackSeconds: number,
): number {
  const bars = settings.bars ?? 4;
  if (!bpm || bpm <= 0) return fallbackSeconds;
  return bars * 4 * (60 / bpm);
}

function trackName(file: DriveFile): string {
  return file.name.replace(/\.[^./]+$/, "");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</h3>
      {children}
    </section>
  );
}

function Segmented({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs transition disabled:opacity-40",
            value === option.value
              ? "bg-accent text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LaneSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className={clsx(disabled && "opacity-40")}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-[60%] truncate rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// MARK: - Lanes
//
// Each lane maps a small set of named options onto keyframes. The read side has to recognize a
// shape it didn't necessarily write (a preset's, or one from a different lane combination),
// which is why they match on the property that defines them rather than on equality with a
// canned curve.

type VolumeLane = "overlap" | "equalPower" | "linear";

function volumeLaneOf(shape: TransitionShape): VolumeLane {
  if (curvesEqual(shape.outgoingVolume, EQUAL_POWER_DOWN)) return "equalPower";
  // Anything that keeps the outgoing track near full through the middle is an overlap, whether
  // it came from `blend` or from `mix`'s own held curve. The threshold is well below 1 because
  // `mix` sits at 0.95 there deliberately.
  if (curveValue(shape.outgoingVolume, 0.5) >= 0.85) return "overlap";
  return "linear";
}

function withVolumeLane(shape: TransitionShape, lane: VolumeLane): TransitionShape {
  switch (lane) {
    case "overlap": {
      const blend = presetShape("blend");
      return { ...shape, outgoingVolume: blend.outgoingVolume, incomingVolume: blend.incomingVolume };
    }
    case "equalPower":
      return { ...shape, outgoingVolume: EQUAL_POWER_DOWN, incomingVolume: EQUAL_POWER_UP };
    case "linear":
      return { ...shape, outgoingVolume: rampCurve(1, 0), incomingVolume: rampCurve(0, 1) };
  }
}

type EqLane = "none" | "bassSwap" | "endBassSwap";

function eqLaneOf(shape: TransitionShape): EqLane {
  if (isConstantCurve(shape.outgoingBass)) return "none";
  return curveValue(shape.outgoingBass, 0.6) < -1 ? "bassSwap" : "endBassSwap";
}

function withEqLane(shape: TransitionShape, lane: EqLane): TransitionShape {
  switch (lane) {
    case "none":
      return { ...shape, outgoingBass: constantCurve(0), incomingBass: constantCurve(0) };
    case "bassSwap": {
      const blend = presetShape("blend");
      return { ...shape, outgoingBass: blend.outgoingBass, incomingBass: blend.incomingBass };
    }
    case "endBassSwap":
      // The swap happens late, so the outgoing track keeps its weight almost to the end.
      return {
        ...shape,
        outgoingBass: curve([
          { t: 0, value: 0 },
          { t: 0.8, value: 0 },
          { t: 0.9, value: -24 },
          { t: 1, value: -24 },
        ]),
        incomingBass: curve([
          { t: 0, value: -24 },
          { t: 0.8, value: -24 },
          { t: 0.9, value: 0 },
          { t: 1, value: 0 },
        ]),
      };
  }
}

type FilterLane = "none" | "highPassIn" | "both";

function filterLaneOf(shape: TransitionShape): FilterLane {
  const hasHighPass = !isConstantCurve(shape.incomingHighPass);
  const hasLowPass = !isConstantCurve(shape.outgoingLowPass);
  if (hasHighPass && hasLowPass) return "both";
  return hasHighPass ? "highPassIn" : "none";
}

function withFilterLane(shape: TransitionShape, lane: FilterLane): TransitionShape {
  const mix = presetShape("mix");
  switch (lane) {
    case "none":
      return { ...shape, outgoingLowPass: constantCurve(0), incomingHighPass: constantCurve(0) };
    case "highPassIn":
      return { ...shape, outgoingLowPass: constantCurve(0), incomingHighPass: mix.incomingHighPass };
    case "both":
      return { ...shape, outgoingLowPass: mix.outgoingLowPass, incomingHighPass: mix.incomingHighPass };
  }
}

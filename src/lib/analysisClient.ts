/**
 * Browser-side driver for track analysis: decode a cached track's blob, run the DSP, hand back a
 * TrackAnalysis.
 *
 * **Why this isn't in a Web Worker.** It should be — the DSP is hundreds of milliseconds to a few
 * seconds of straight-line arithmetic per track, which is exactly what a worker is for, and the
 * iOS version of this runs on a detached task for the same reason. But this Next version bundles
 * with Turbopack, and `new Worker(new URL("./x.worker.ts", import.meta.url))` is not compiled
 * into a worker chunk here: the build emits the file verbatim into `.next/static/media/` as an
 * asset (verified against both a `.ts` and a `.js` worker entry, with and without
 * `{ type: "module" }`). A raw TypeScript file can't be parsed by the browser, and a raw JS one
 * has unresolved bare imports, so either way the worker dies on construction.
 *
 * So the work runs here, sliced: `analyzeSamplesSteps` surrenders control every few hundred FFT
 * frames and this loop hands the browser a turn whenever a slice has been running longer than
 * SLICE_BUDGET_MS. The page stays responsive through a library-wide scan, which is the thing a
 * worker would actually have bought. (Playback itself was never at risk — Web Audio renders on
 * its own thread.)
 *
 * If a future Turbopack compiles worker entries, moving `analyzeSamplesSteps` behind a worker is
 * a contained change: everything below the decode is already a pure function of the samples.
 */

import { ANALYSIS_SAMPLE_RATE, CUTOFF_SAMPLE_RATE, analyzeSamplesSteps } from "@/lib/analyzer";
import type { TrackAnalysis } from "@/types";

/** How long a slice may run before the browser gets a turn. Comfortably inside a frame at 60Hz,
 * so scrolling and animation keep up while analysis runs. */
const SLICE_BUDGET_MS = 8;

/** Decodes `blob` to mono at CUTOFF_SAMPLE_RATE.
 *
 * Full rate, not the analysis rate: the spectral-cutoff measurement is *about* the top of the
 * spectrum, and a copy resampled to 22.05kHz has already had that thrown away — a 128kbps file
 * and a lossless one would measure identically. The analyzer halves the rate itself for
 * everything else (see downsampleByTwo), so this is one decode rather than two. */
async function decodeMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const OfflineAudioContextCtor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  // A one-frame context: nothing is rendered through it, it exists only because decodeAudioData
  // is a method on a context and resamples to that context's rate.
  const context = new OfflineAudioContextCtor(1, 1, CUTOFF_SAMPLE_RATE);
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = await context.decodeAudioData(arrayBuffer);

  const channels = buffer.numberOfChannels;
  if (channels === 1) {
    return { samples: buffer.getChannelData(0), sampleRate: buffer.sampleRate };
  }
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) mono[i] += data[i];
  }
  for (let i = 0; i < mono.length; i++) mono[i] /= channels;
  return { samples: mono, sampleRate: buffer.sampleRate };
}

/** Hands the browser a turn. `scheduler.yield` is the purpose-built version of this and keeps
 * the continuation at a high priority; the timeout is the fallback everywhere else. */
function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * Decodes and analyzes one track. Returns null when the file can't be decoded at all — every
 * other failure (no detectable tempo, no key, no cutoff) comes back as a partial analysis, since
 * a waveform and a duration are still worth having.
 *
 * `onProgress` reports roughly 0..1 through the DSP, for callers that want to show it.
 */
export async function analyzeTrack(
  fileId: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<TrackAnalysis | null> {
  let decoded: { samples: Float32Array; sampleRate: number };
  try {
    decoded = await decodeMono(blob);
  } catch {
    return null;
  }
  // Under a second of audio isn't a track, and every measurement below needs more context than
  // that to say anything (the tempo search alone wants several seconds of onsets).
  if (decoded.samples.length < ANALYSIS_SAMPLE_RATE) return null;

  const steps = analyzeSamplesSteps({
    fileId,
    samples: decoded.samples,
    sampleRate: decoded.sampleRate,
  });

  let sliceStarted = performance.now();
  let step = steps.next();
  while (!step.done) {
    onProgress?.(step.value);
    if (performance.now() - sliceStarted >= SLICE_BUDGET_MS) {
      await yieldToBrowser();
      sliceStarted = performance.now();
    }
    step = steps.next();
  }
  onProgress?.(1);
  return step.value;
}

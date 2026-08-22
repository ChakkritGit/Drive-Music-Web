/**
 * Reads decoded audio and works out its tempo, beat grid, key, loudness envelope and spectral
 * cutoff — everything a TrackAnalysis holds. The browser ships no API for any of this (there is
 * no "give me the BPM" call in Web Audio), so it's all computed here from the samples.
 *
 * Ported from the iOS app's TrackAnalyzer.swift, which does the same arithmetic through
 * Accelerate/vDSP. The approach, in order:
 *
 * 1. Work at a reduced rate (ANALYSIS_SAMPLE_RATE). Tempo and key both live far below 11kHz,
 *    and everything downstream is O(samples) — halving the rate halves the work for no loss
 *    that matters.
 * 2. Build a **spectral-flux onset envelope**: FFT each short frame, sum how much energy *rose*
 *    since the previous frame. Rises are note/drum attacks; falls are decay, which is why only
 *    the positive part is kept. The standard first step for tempo, and by far the most reliable
 *    part of the pipeline.
 * 3. **Autocorrelate** that envelope to find the lag that best explains its periodicity — the
 *    beat period. Searched over 70–180 BPM, with the octave ambiguity resolved toward the middle
 *    of that range (a tempo detector's classic failure is reporting half or double the real
 *    tempo, and both are genuinely "correct" periodicities in the signal).
 * 4. Find the **beat phase** by testing every offset within one beat period and keeping the one
 *    where the onsets line up best. Tempo says how far apart beats are; this says where they are.
 * 5. **Chroma + key**: fold the spectrum into 12 pitch classes, correlate against the
 *    Krumhansl–Schmuckler major/minor profiles, take the best of the 24, map to Camelot.
 *
 * Known limitations, stated plainly because they set the ceiling on what the mix can do:
 * **constant tempo is assumed** — a track that speeds up, or a live recording without a click,
 * gets a grid that drifts out of phase with it. Key detection is whole-track, so a piece that
 * modulates reports whichever key dominates.
 *
 * Two deliberate deviations from the iOS version, both because the platform differs rather than
 * because the algorithm should:
 *
 * - **One decode, not two.** iOS decodes the file twice (once at 22.05kHz for everything, once
 *   at 44.1kHz for the cutoff measurement, which is *about* the top of the spectrum and so can't
 *   use a downsampled copy). Here `decodeAudioData` is the single most expensive step and can't
 *   stream, so the caller decodes once at 44.1kHz and this halves that itself — same two rates,
 *   one decode.
 * - **Flux and chroma share a pass.** iOS runs the FFT twice over the reduced samples, once for
 *   onsets and once (every 4th frame) for chroma. Here they're accumulated in the same loop,
 *   which is worth roughly a quarter of the analysis time in JS.
 */

import { ANALYZER_VERSION } from "@/lib/analysis";
import type { TrackAnalysis } from "@/types";

/** Everything except cutoff detection runs at this rate. 22.05kHz keeps the full range that
 * matters for onsets and pitch (Nyquist at ~11kHz) at half the samples of CD rate. */
export const ANALYSIS_SAMPLE_RATE = 22_050;

/** Cutoff detection has to run at full rate instead. At ANALYSIS_SAMPLE_RATE everything above
 * 11kHz — the entire range where lossy encoders put their wall — has already been thrown away
 * by the resampler, so a 128kbps file and a lossless one would measure identically. */
export const CUTOFF_SAMPLE_RATE = 44_100;

/** FFT frame size and hop, in samples. 2048/512 at 22.05kHz is ~93ms of context every ~23ms —
 * the usual trade for onset detection: long enough for usable frequency resolution, hopped often
 * enough to place an attack to within a fraction of a beat. */
export const FRAME_SIZE = 2048;
export const HOP_SIZE = 512;

/** How strongly the winning beat period has to stand out from the average of all candidates
 * before its tempo is reported at all. Below this the envelope has no clear periodicity, so
 * rather than pick the tallest bump in what is essentially noise, analysis returns no BPM and
 * the mix falls back to unaligned transitions. */
export const MINIMUM_TEMPO_CONFIDENCE = 1.35;

export const MINIMUM_BPM = 70;
export const MAXIMUM_BPM = 180;

/** Number of points in the stored loudness envelope. Enough to draw a recognizable waveform
 * without storing an array per track that rivals the audio itself. */
export const WAVEFORM_RESOLUTION = 400;

/** Frames per second of the onset envelope — every lag in tempo detection is in these frames. */
export const FLUX_RATE = ANALYSIS_SAMPLE_RATE / HOP_SIZE;

/** How many FFT frames to process between yields. At ~2500 frames a second, 256 is roughly a
 * tenth of a second of work — small enough that the page stays responsive, large enough that the
 * generator's own overhead stays in the noise. */
const YIELD_FRAMES = 256;

/** Runs a sliced measurement straight through, ignoring the progress it reports. What the tests
 * and any caller that doesn't care about responsiveness use. */
function drain<T>(steps: Generator<number, T, void>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Rescales a sliced measurement's own 0..1 progress into the [from, to] slice of a larger
 * job's, so a caller sees one monotonic number rather than several restarting ones. */
function* weighted<T>(
  steps: Generator<number, T, void>,
  from: number,
  to: number,
): Generator<number, T, void> {
  let step = steps.next();
  while (!step.done) {
    yield from + (to - from) * step.value;
    step = steps.next();
  }
  return step.value;
}

// MARK: - FFT

/**
 * Iterative in-place radix-2 complex FFT with precomputed twiddles and bit-reversal.
 *
 * One instance is reused across every frame of a track — the tables cost more to build than a
 * single transform costs to run, and a track is tens of thousands of transforms.
 */
export class Fft {
  private readonly size: number;
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly reversed: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;
    const half = size / 2;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      this.cosTable[i] = Math.cos((2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((2 * Math.PI * i) / size);
    }
    const levels = Math.round(Math.log2(size));
    this.reversed = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let value = 0;
      for (let bit = 0; bit < levels; bit++) {
        if ((i >> bit) & 1) value |= 1 << (levels - 1 - bit);
      }
      this.reversed[i] = value;
    }
  }

  /** Forward transform, in place. Both arrays must be `size` long. */
  transform(real: Float64Array, imaginary: Float64Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reversed[i];
      if (j > i) {
        let temp = real[i];
        real[i] = real[j];
        real[j] = temp;
        temp = imaginary[i];
        imaginary[i] = imaginary[j];
        imaginary[j] = temp;
      }
    }
    for (let span = 2; span <= n; span *= 2) {
      const halfSpan = span / 2;
      const tableStep = n / span;
      for (let start = 0; start < n; start += span) {
        for (let offset = 0, index = 0; offset < halfSpan; offset++, index += tableStep) {
          const upper = start + offset + halfSpan;
          const lower = start + offset;
          const cos = this.cosTable[index];
          // Negative sine: forward transform, e^-i2πk/N.
          const sin = -this.sinTable[index];
          const realPart = real[upper] * cos - imaginary[upper] * sin;
          const imagPart = real[upper] * sin + imaginary[upper] * cos;
          real[upper] = real[lower] - realPart;
          imaginary[upper] = imaginary[lower] - imagPart;
          real[lower] += realPart;
          imaginary[lower] += imagPart;
        }
      }
    }
  }
}

/**
 * Magnitude spectrum of a real-valued frame, bins 0..N/2-1.
 *
 * Real input is packed into a half-length complex transform (even samples as the real part, odd
 * as the imaginary) and untangled afterwards — the standard real-FFT trick, and worth taking
 * here rather than zero-filling an imaginary array: it halves the cost of the single most
 * expensive loop in the app, and analysis is measured in seconds per track either way.
 */
export class RealSpectrum {
  readonly size: number;
  private readonly fft: Fft;
  private readonly real: Float64Array;
  private readonly imaginary: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  /** Magnitudes for bins 0..size/2-1, overwritten by every `compute` call. */
  readonly magnitudes: Float64Array;

  constructor(size: number) {
    this.size = size;
    const half = size / 2;
    this.fft = new Fft(half);
    this.real = new Float64Array(half);
    this.imaginary = new Float64Array(half);
    this.magnitudes = new Float64Array(half);
    this.cos = new Float64Array(half);
    this.sin = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / size);
      this.sin[k] = Math.sin((2 * Math.PI * k) / size);
    }
  }

  /** Fills (and returns) `magnitudes` for `frame`, which must be `size` samples long. */
  compute(frame: Float64Array): Float64Array {
    const half = this.size / 2;
    for (let k = 0; k < half; k++) {
      this.real[k] = frame[2 * k];
      this.imaginary[k] = frame[2 * k + 1];
    }
    this.fft.transform(this.real, this.imaginary);

    for (let k = 0; k < half; k++) {
      const mirror = (half - k) % half;
      const zr1 = this.real[k];
      const zi1 = this.imaginary[k];
      // conj(Z[N/2 - k])
      const zr2 = this.real[mirror];
      const zi2 = -this.imaginary[mirror];
      // Even-indexed half-spectrum...
      const ar = 0.5 * (zr1 + zr2);
      const ai = 0.5 * (zi1 + zi2);
      // ...and the odd-indexed one, rotated by -i·e^(-2πik/N).
      const br = 0.5 * (zr1 - zr2);
      const bi = 0.5 * (zi1 - zi2);
      const cos = this.cos[k];
      const sin = this.sin[k];
      const tr = -sin * br + cos * bi;
      const ti = -(sin * bi + cos * br);
      const re = ar + tr;
      const im = ai + ti;
      this.magnitudes[k] = Math.sqrt(re * re + im * im);
    }
    return this.magnitudes;
  }
}

export function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

// MARK: - Resampling

/**
 * Halves the sample rate, low-passing first with a 3-tap [1/4, 1/2, 1/4] kernel so the top
 * octave doesn't fold back down as aliasing. Crude as filters go, and entirely adequate here:
 * everything the reduced-rate pass measures (onsets, pitch classes, a 400-point envelope) lives
 * well below the new Nyquist.
 */
export function downsampleByTwo(samples: Float32Array): Float32Array {
  const outputLength = Math.floor(samples.length / 2);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const center = i * 2;
    const previous = center > 0 ? samples[center - 1] : samples[center];
    const next = center + 1 < samples.length ? samples[center + 1] : samples[center];
    output[i] = 0.25 * previous + 0.5 * samples[center] + 0.25 * next;
  }
  return output;
}

/** Linear-interpolating resample, for the rare source that isn't exactly twice the analysis
 * rate. Only reached when the caller couldn't decode at CUTOFF_SAMPLE_RATE. */
export function resampleTo(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples;
  if (Math.abs(fromRate - toRate * 2) < 1) return downsampleByTwo(samples);
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(samples.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = samples[index];
    const b = index + 1 < samples.length ? samples[index + 1] : a;
    output[i] = a + (b - a) * fraction;
  }
  return output;
}

// MARK: - Waveform

/**
 * Peak-per-bucket envelope, normalized so the loudest point is 1. Peak rather than RMS because
 * this is drawn, and a peak envelope is what makes a waveform look like the shape people
 * recognize; RMS reads as a flat sausage.
 */
export function envelope(samples: Float32Array, buckets: number): number[] {
  if (buckets <= 0 || samples.length === 0) return [];
  const bucketSize = Math.max(1, Math.floor(samples.length / buckets));
  const result: number[] = [];
  let index = 0;
  while (index < samples.length && result.length < buckets) {
    const end = Math.min(index + bucketSize, samples.length);
    let peak = 0;
    for (let i = index; i < end; i++) {
      const magnitude = Math.abs(samples[i]);
      if (magnitude > peak) peak = magnitude;
    }
    result.push(peak);
    index = end;
  }
  const maximum = result.reduce((max, value) => (value > max ? value : max), 0);
  if (maximum <= 0) return result;
  return result.map((value) => value / maximum);
}

// MARK: - Mix points

/**
 * How loud the track has to get, relative to its own typical level, before it counts as having
 * started. Intros are rarely silent — a pad, a filtered loop, a spoken sample — so a threshold
 * against silence finds nothing. Against the track's own median it finds the point where the
 * arrangement actually arrives.
 */
export const MIX_IN_THRESHOLD = 0.72;

/** Never further in than this fraction of the track, whatever the envelope says. A track that
 * builds slowly for two minutes shouldn't have its mix-in put two minutes deep — at that point
 * the transition is skipping most of the song rather than starting it well. */
export const MAXIMUM_MIX_IN_FRACTION = 0.25;

/** Same judgement as MIX_IN_THRESHOLD made at the other end of the track, and deliberately the
 * same value — but a separate constant, since the two ends have no reason to move together. */
export const MIX_OUT_THRESHOLD = 0.72;

/** Never earlier than this fraction of the track. A quiet breakdown two thirds of the way in is
 * not the outro, and mixing out there would cut off a third of the song. */
export const MINIMUM_MIX_OUT_FRACTION = 0.5;

/** The track's own "normal" loudness: the median of the non-trivial part of the envelope,
 * unaffected by however long its quiet opening happens to be. */
function soundingMedian(envelopeValues: number[]): number | null {
  const sounding = envelopeValues.filter((value) => value > 0.05).sort((a, b) => a - b);
  if (sounding.length === 0) return null;
  return sounding[Math.floor(sounding.length / 2)];
}

/**
 * The first moment the track is properly underway, snapped forward to a bar line.
 *
 * Bars, not beats: the incoming track's *downbeat* is what should land on the outgoing track's
 * downbeat. Arriving on beat 3 of a bar is on-grid and still sounds wrong.
 */
export function mixInPoint(
  envelopeValues: number[],
  duration: number,
  bpm: number | undefined,
  firstBeat: number | undefined,
): number | undefined {
  if (envelopeValues.length === 0 || duration <= 0) return undefined;
  const reference = soundingMedian(envelopeValues);
  if (reference === null) return undefined;
  const threshold = reference * MIX_IN_THRESHOLD;

  const secondsPerBucket = duration / envelopeValues.length;
  // Sustained, not instantaneous: a single loud spike in an intro (a riser, a vocal stab) isn't
  // the track starting. Requires roughly a second of continuous energy.
  const runLength = Math.max(1, Math.floor(1 / secondsPerBucket));
  let run = 0;
  let startIndex: number | null = null;
  for (let index = 0; index < envelopeValues.length; index++) {
    if (envelopeValues[index] >= threshold) {
      run += 1;
      if (run >= runLength) {
        startIndex = index - run + 1;
        break;
      }
    } else {
      run = 0;
    }
  }
  if (startIndex === null) return undefined;

  let seconds = startIndex * secondsPerBucket;
  seconds = Math.min(seconds, duration * MAXIMUM_MIX_IN_FRACTION);

  // Snap forward to a bar line so the incoming downbeat is a real downbeat. Without a grid the
  // un-snapped point is still far better than 0:00, so it's returned as-is.
  if (!bpm || bpm <= 0 || firstBeat === undefined) return seconds;
  const barLength = (60 / bpm) * 4;
  if (seconds <= firstBeat) return firstBeat;
  const bars = Math.ceil((seconds - firstBeat) / barLength);
  return firstBeat + bars * barLength;
}

/**
 * Where the track's last full-strength section ends — the start of its outro.
 *
 * Scans backwards, so what it finds is the *last* time the arrangement was at full strength, not
 * the first time it stopped being (which any mid-track breakdown would satisfy). A track that
 * ends hard has its final section running to the last bucket, and this returns a time at or near
 * `duration` — the same answer as having no outro at all, which is correct.
 *
 * Not snapped to a bar, unlike mixInPoint: this is only a *proposal* that the caller aligns
 * against the outgoing track's grid alongside the transition length it's planning. Snapping in
 * both places would round twice.
 */
export function mixOutPoint(envelopeValues: number[], duration: number): number | undefined {
  if (envelopeValues.length === 0 || duration <= 0) return undefined;
  const reference = soundingMedian(envelopeValues);
  if (reference === null) return undefined;
  const threshold = reference * MIX_OUT_THRESHOLD;

  const secondsPerBucket = duration / envelopeValues.length;
  const runLength = Math.max(1, Math.floor(1 / secondsPerBucket));
  let run = 0;
  let lastStrongIndex: number | null = null;
  for (let index = envelopeValues.length - 1; index >= 0; index--) {
    if (envelopeValues[index] >= threshold) {
      run += 1;
      if (run >= runLength) {
        // The run was walked backwards from its end, so it occupies index..index+run and the
        // outro begins where it stops.
        lastStrongIndex = index + run;
        break;
      }
    } else {
      run = 0;
    }
  }
  if (lastStrongIndex === null) return undefined;

  const seconds = lastStrongIndex * secondsPerBucket;
  return Math.min(Math.max(seconds, duration * MINIMUM_MIX_OUT_FRACTION), duration);
}

// MARK: - Onsets, tempo and chroma

export interface OnsetAndChroma {
  /** Normalized, locally-mean-subtracted onset envelope, one value per hop. */
  flux: Float32Array;
  /** Whole-track pitch-class distribution, summing to 1 (or all zeros for silence). */
  chroma: number[];
}

/**
 * Spectral flux and the chroma vector in a single pass over the reduced-rate samples.
 *
 * Flux: for each frame, the total *increase* in magnitude per frequency bin since the previous
 * frame. Peaks in this line up with note and drum attacks, which is what a beat grid is
 * ultimately made of.
 *
 * Chroma: every 4th frame's spectrum folded into 12 pitch classes. Key is a property of the
 * whole track, so a quarter of the frames is plenty.
 */
export function onsetAndChroma(samples: Float32Array): OnsetAndChroma {
  return drain(onsetAndChromaSteps(samples));
}

/**
 * The same measurement, surrendered in slices.
 *
 * This is the expensive loop of the whole analyzer — tens of thousands of FFTs — and it runs on
 * the main thread (see src/lib/analysisClient.ts for why there's no worker). Yielding every
 * YIELD_FRAMES frames lets the caller hand control back to the browser between slices, so a
 * library-wide scan doesn't freeze the page for minutes. Each yield reports progress in 0..1.
 */
export function* onsetAndChromaSteps(
  samples: Float32Array,
): Generator<number, OnsetAndChroma, void> {
  const chroma = new Array<number>(12).fill(0);
  if (samples.length < FRAME_SIZE) {
    return { flux: new Float32Array(0), chroma };
  }

  const spectrum = new RealSpectrum(FRAME_SIZE);
  const window = hannWindow(FRAME_SIZE);
  const halfSize = FRAME_SIZE / 2;
  const windowed = new Float64Array(FRAME_SIZE);
  const previousMagnitudes = new Float64Array(halfSize);
  const binWidth = ANALYSIS_SAMPLE_RATE / FRAME_SIZE;

  // Precomputed per bin: which pitch class it lands on, or -1 for bins outside the range where
  // pitch is actually carried (roughly A1 to A7).
  const pitchClasses = new Int8Array(halfSize).fill(-1);
  for (let bin = 1; bin < halfSize; bin++) {
    const frequency = bin * binWidth;
    if (frequency < 55 || frequency > 3520) continue;
    // Semitones above A1 (55Hz), folded to a pitch class. +9 shifts A to index 9 so index 0
    // lands on C, matching the key profiles and Camelot tables below.
    const semitone = 12 * Math.log2(frequency / 55);
    pitchClasses[bin] = (((Math.round(semitone) + 9) % 12) + 12) % 12;
  }

  const frameCount = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const flux = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    if (frame > 0 && frame % YIELD_FRAMES === 0) yield frame / frameCount;
    const start = frame * HOP_SIZE;
    for (let i = 0; i < FRAME_SIZE; i++) windowed[i] = samples[start + i] * window[i];
    const magnitudes = spectrum.compute(windowed);

    let frameFlux = 0;
    for (let bin = 0; bin < halfSize; bin++) {
      const rise = magnitudes[bin] - previousMagnitudes[bin];
      if (rise > 0) frameFlux += rise;
      previousMagnitudes[bin] = magnitudes[bin];
    }
    flux[frame] = frameFlux;

    if (frame % 4 === 0) {
      for (let bin = 1; bin < halfSize; bin++) {
        const pitchClass = pitchClasses[bin];
        if (pitchClass >= 0) chroma[pitchClass] += magnitudes[bin];
      }
    }
  }

  const total = chroma.reduce((sum, value) => sum + value, 0);
  const normalizedChroma = total > 0 ? chroma.map((value) => value / total) : chroma;
  return { flux: normalizeAndSmooth(flux), chroma: normalizedChroma };
}

/**
 * Subtracts a local moving average and clips at zero, then normalizes. Without this, a track
 * that gets louder partway through swamps the autocorrelation with its own dynamics rather than
 * its rhythm — what matters is each onset relative to its neighbours, not absolutely.
 */
export function normalizeAndSmooth(flux: Float32Array): Float32Array {
  if (flux.length === 0) return flux;
  const windowRadius = 10;
  const result = new Float32Array(flux.length);
  // Running sum rather than re-summing the window at every index — same numbers, one pass.
  let runningSum = 0;
  for (let i = 0; i <= Math.min(windowRadius, flux.length - 1); i++) runningSum += flux[i];
  let maximum = 0;
  for (let index = 0; index < flux.length; index++) {
    const lower = Math.max(0, index - windowRadius);
    const upper = Math.min(flux.length - 1, index + windowRadius);
    const localMean = runningSum / (upper - lower + 1);
    const value = Math.max(0, flux[index] - localMean);
    result[index] = value;
    if (value > maximum) maximum = value;
    // Slide the window forward for the next index.
    const nextLower = Math.max(0, index + 1 - windowRadius);
    const nextUpper = Math.min(flux.length - 1, index + 1 + windowRadius);
    if (nextLower > lower) runningSum -= flux[lower];
    if (nextUpper > upper) runningSum += flux[nextUpper];
  }
  if (maximum <= 0) return result;
  for (let index = 0; index < result.length; index++) result[index] /= maximum;
  return result;
}

/** Relative to the normalized maximum of 1. */
const ONSET_FLOOR = 0.2;

/** Fewer beats than this is not a tempo, it is a coincidence — and an autocorrelation over a
 * plausible-period range will always find *something*. */
const MINIMUM_ONSETS = 8;

/**
 * Whether there are enough onsets here to be talking about a tempo at all.
 *
 * The envelope is normalized to a maximum of 1, so a track with no attacks still produces a
 * confident-looking one: a single accidental spike becomes 1.0 and the autocorrelation finds a
 * periodicity in what is essentially noise. A held tone measured that way reports a plausible
 * BPM that then shapes every mix out of the track. A pulse is not one loud frame, it is many.
 */
function hasEnoughOnsets(flux: Float32Array): boolean {
  let count = 0;
  for (let i = 0; i < flux.length; i++) {
    if (flux[i] > ONSET_FLOOR) count++;
    if (count >= MINIMUM_ONSETS) return true;
  }
  return false;
}

export interface TempoResult {
  bpm?: number;
  firstBeatSeconds?: number;
}

/**
 * Autocorrelation over the plausible beat-period range, then phase. Returns an empty result when
 * nothing stands out clearly enough (see MINIMUM_TEMPO_CONFIDENCE).
 */
export function tempoAndPhase(flux: Float32Array): TempoResult {
  if (flux.length <= 64 || !hasEnoughOnsets(flux)) return {};

  const minimumLag = Math.round((60 / MAXIMUM_BPM) * FLUX_RATE);
  const maximumLag = Math.round((60 / MINIMUM_BPM) * FLUX_RATE);
  if (maximumLag <= minimumLag || maximumLag >= flux.length) return {};

  const scores = new Float64Array(maximumLag - minimumLag + 1);
  for (let lag = minimumLag; lag <= maximumLag; lag++) {
    let sum = 0;
    for (let index = 0; index + lag < flux.length; index++) {
      sum += flux[index] * flux[index + lag];
    }
    scores[lag - minimumLag] = sum / (flux.length - lag);
  }

  let peakIndex = 0;
  let total = 0;
  for (let i = 0; i < scores.length; i++) {
    total += scores[i];
    if (scores[i] > scores[peakIndex]) peakIndex = i;
  }
  const mean = total / scores.length;
  if (mean <= 0 || scores[peakIndex] / mean < MINIMUM_TEMPO_CONFIDENCE) return {};

  let bpm = (60 * FLUX_RATE) / refinedLag(scores, peakIndex, minimumLag);
  // Octave correction. Half- and double-tempo are both real periodicities of the same signal, so
  // the raw winner is often musically the wrong one of the pair; pulling toward 90–160 BPM picks
  // the reading a listener would call "the tempo" for nearly all popular music, which is the
  // only music this feature is aimed at.
  while (bpm < 90 && bpm * 2 <= MAXIMUM_BPM) bpm *= 2;
  while (bpm > 160 && bpm / 2 >= MINIMUM_BPM) bpm /= 2;

  const periodFrames = (60 * FLUX_RATE) / bpm;
  const firstBeatSeconds = beatPhase(flux, periodFrames);
  return { bpm, firstBeatSeconds };
}

/**
 * The peak lag, refined below the resolution of the lag grid itself.
 *
 * Lags are whole frames, and around 128 BPM one frame is about six BPM — so the raw winner is
 * the *nearest representable* tempo, not the tempo. That shows up twice over: a badge that reads
 * 129 for a 128 BPM track, and, far worse, a beat grid built from the rounded period that
 * drifts. At 13ms of error per beat a four-minute track ends several seconds out of phase with
 * itself, which is exactly the alignment beatmatching depends on.
 *
 * Fitting a parabola through the winning score and its two neighbours puts the peak where the
 * underlying continuous correlation actually peaks. Three points and one divide.
 */
function refinedLag(scores: Float64Array, peakIndex: number, minimumLag: number): number {
  const lag = peakIndex + minimumLag;
  if (peakIndex <= 0 || peakIndex >= scores.length - 1) return lag;
  const before = scores[peakIndex - 1];
  const at = scores[peakIndex];
  const after = scores[peakIndex + 1];
  const curvature = before - 2 * at + after;
  // A flat or upward-curving neighbourhood is not a peak to refine; leaving it alone is the only
  // safe answer, and the confidence gate above has already accepted this lag.
  if (curvature >= 0) return lag;
  const offset = (0.5 * (before - after)) / curvature;
  return offset > -1 && offset < 1 ? lag + offset : lag;
}

/**
 * Tries every offset within one beat period and keeps whichever makes the onsets sum highest —
 * i.e. the alignment where the grid's beats land on actual attacks rather than between them.
 * Returned in seconds from the start of the file.
 */
export function beatPhase(flux: Float32Array, periodFrames: number): number | undefined {
  if (periodFrames < 1 || flux.length <= Math.floor(periodFrames)) return undefined;
  let bestOffset = 0;
  let bestScore = -Infinity;
  const offsets = Math.round(periodFrames);
  for (let offset = 0; offset < offsets; offset++) {
    let score = 0;
    for (let position = offset; position < flux.length; position += periodFrames) {
      score += flux[Math.floor(position)];
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return bestOffset / FLUX_RATE;
}

// MARK: - Key

/** Krumhansl–Schmuckler key profiles — how strongly each of the 12 pitch classes tends to be
 * present in a piece in a given key, derived from listener ratings. Correlating a track's own
 * pitch-class distribution against all 24 rotations of these is the standard key-finding method,
 * and cheap once the chroma vector exists. */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Camelot wheel positions, indexed by pitch class (C, C#, D, ...). Two lookup tables rather
 * than the arithmetic that generates them — the wheel's ordering is a fixed fact about the
 * notation, and a table is impossible to get subtly wrong the way a modular formula is. */
const MAJOR_CAMELOT = [
  "8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B",
];
const MINOR_CAMELOT = [
  "5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A",
];

/** Below this the correlation is flat: the track has no clear tonal center (percussion-only,
 * heavily processed, spoken word) and no key is a better answer than an arbitrary one. */
const MINIMUM_KEY_CORRELATION = 0.6;

export function detectKey(chroma: number[]): string | undefined {
  if (!chroma.some((value) => value > 0)) return undefined;

  let bestScore = -Infinity;
  let bestKey: string | undefined;
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = Array.from({ length: 12 }, (_, index) => chroma[(index + tonic) % 12]);
    const majorScore = correlation(rotated, MAJOR_PROFILE);
    const minorScore = correlation(rotated, MINOR_PROFILE);
    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestKey = MAJOR_CAMELOT[tonic];
    }
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = MINOR_CAMELOT[tonic];
    }
  }
  return bestScore > MINIMUM_KEY_CORRELATION ? bestKey : undefined;
}

/** Pearson correlation — the standard scoring for key profiles, and unlike a plain dot product
 * it's insensitive to how loud the track is or how the chroma was normalized. */
function correlation(a: number[], b: number[]): number {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index++) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    covariance += deltaA * deltaB;
    varianceA += deltaA * deltaA;
    varianceB += deltaB * deltaB;
  }
  if (varianceA <= 0 || varianceB <= 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}

// MARK: - Spectral cutoff

/**
 * Long-term average magnitude spectrum. Every 8th frame — a cutoff is a property of the whole
 * file, so this is plenty, and at full sample rate the frame count is otherwise four times what
 * tempo analysis handles.
 */
export function averageSpectrum(samples: Float32Array): Float64Array | null {
  return drain(averageSpectrumSteps(samples));
}

export function* averageSpectrumSteps(
  samples: Float32Array,
): Generator<number, Float64Array | null, void> {
  if (samples.length < FRAME_SIZE * 5) return null;
  const spectrum = new RealSpectrum(FRAME_SIZE);
  const window = hannWindow(FRAME_SIZE);
  const halfSize = FRAME_SIZE / 2;
  const windowed = new Float64Array(FRAME_SIZE);
  const accumulator = new Float64Array(halfSize);
  const stride = HOP_SIZE * 8;

  let frames = 0;
  const totalFrames = Math.max(1, Math.floor(samples.length / stride));
  for (let start = 0; start + FRAME_SIZE <= samples.length; start += stride) {
    if (frames > 0 && frames % YIELD_FRAMES === 0) yield frames / totalFrames;
    for (let i = 0; i < FRAME_SIZE; i++) windowed[i] = samples[start + i] * window[i];
    const magnitudes = spectrum.compute(windowed);
    for (let bin = 0; bin < halfSize; bin++) accumulator[bin] += magnitudes[bin];
    frames++;
  }
  // A handful of frames is not a long-term average of anything.
  if (frames <= 4) return null;
  for (let bin = 0; bin < halfSize; bin++) accumulator[bin] /= frames;
  return accumulator;
}

/**
 * Finds where the track's spectrum stops — the low-pass wall a lossy encoder left behind.
 *
 * Walks *down* from Nyquist over the long-term average spectrum and returns the first frequency
 * whose energy rises above a floor set relative to the track's own mid-band level. Averaging
 * over the whole file matters: any single frame can be quiet or dull, but a hard encoder cutoff
 * is the one feature that holds across every frame.
 *
 * Returns undefined only when the measurement can't be made at all (too quiet, too short) —
 * *not* when the spectrum runs all the way to Nyquist, which is the best possible answer and has
 * to be reported as one. Callers distinguish "measured" from "unmeasurable" by this.
 */
export function detectSpectralCutoff(
  spectrum: Float64Array | null,
  sampleRate: number,
): number | undefined {
  if (!spectrum) return undefined;
  const binWidth = sampleRate / FRAME_SIZE;

  // Reference level: the median of the 200Hz–5kHz band, where essentially all music has energy.
  // Median rather than mean so a single resonant peak doesn't drag the reference up and make
  // everything above look quiet by comparison.
  const referenceLow = Math.floor(200 / binWidth);
  const referenceHigh = Math.min(spectrum.length - 1, Math.floor(5_000 / binWidth));
  if (referenceHigh <= referenceLow) return undefined;
  const band = Array.from(spectrum.slice(referenceLow, referenceHigh + 1)).sort((a, b) => a - b);
  const reference = band[Math.floor((referenceHigh - referenceLow) / 2)];
  if (!reference || reference <= 0) return undefined;

  // -60dB below that reference is the "this band is empty" line. Encoders don't zero the band
  // above their cutoff so much as leave it at the noise floor, and 60dB down is safely into that
  // while still well above the numerical noise of the FFT itself.
  const threshold = reference * 0.001;

  const lowestPlausibleBin = Math.floor(10_000 / binWidth);
  for (let bin = spectrum.length - 1; bin > lowestPlausibleBin; bin--) {
    if (spectrum[bin] > threshold) return bin * binWidth;
  }
  // Nothing above 10kHz at all. Real, and worth reporting: that's a very lossy source (or a
  // recording with no high end whatsoever).
  return lowestPlausibleBin * binWidth;
}

// MARK: - Entry point

export interface AnalyzeInput {
  fileId: string;
  /** Mono samples at `sampleRate`, ideally CUTOFF_SAMPLE_RATE. Decoding is the caller's job:
   * it's the one part of this that isn't pure arithmetic, and keeping it out is what makes
   * every measurement below testable without a browser. */
  samples: Float32Array;
  sampleRate: number;
}

/**
 * Runs every measurement over one track's samples, straight through.
 *
 * Hundreds of milliseconds to seconds of arithmetic in one go, which is fine for tests and for
 * anything that can afford to block. The browser uses analyzeSamplesSteps instead, through
 * src/lib/analysisClient.ts, so the page keeps running while it works.
 */
export function analyzeSamples(input: AnalyzeInput): TrackAnalysis {
  return drain(analyzeSamplesSteps(input));
}

/**
 * Every measurement, surrendered in slices — what the browser actually runs. See
 * onsetAndChromaSteps; the yielded number is rough overall progress in 0..1.
 */
export function* analyzeSamplesSteps({
  fileId,
  samples,
  sampleRate,
}: AnalyzeInput): Generator<number, TrackAnalysis, void> {
  const duration = samples.length / sampleRate;

  // The cutoff first, while the full-rate samples are still the ones in hand — it's the one
  // measurement that's about the top of the spectrum and can't be made on the reduced copy.
  // Weighted as the first third of the progress reported, which is roughly its share of the
  // work: a quarter of the frames of the pass below, at twice the sample rate.
  const spectrum = yield* weighted(averageSpectrumSteps(samples), 0, 0.3);
  const spectralCutoffHz = detectSpectralCutoff(spectrum, sampleRate);

  const reduced =
    sampleRate === ANALYSIS_SAMPLE_RATE
      ? samples
      : resampleTo(samples, sampleRate, ANALYSIS_SAMPLE_RATE);

  const waveform = envelope(reduced, WAVEFORM_RESOLUTION);
  const { flux, chroma } = yield* weighted(onsetAndChromaSteps(reduced), 0.3, 0.95);
  const { bpm, firstBeatSeconds } = tempoAndPhase(flux);
  const camelotKey = detectKey(chroma);

  return {
    fileId,
    bpm,
    firstBeatSeconds,
    camelotKey,
    mixInSeconds: mixInPoint(waveform, duration, bpm, firstBeatSeconds),
    mixOutSeconds: mixOutPoint(waveform, duration),
    durationSeconds: duration,
    spectralCutoffHz,
    waveform,
    version: ANALYZER_VERSION,
  };
}

import { describe, expect, it } from "vitest";
import {
  ANALYSIS_SAMPLE_RATE,
  CUTOFF_SAMPLE_RATE,
  FRAME_SIZE,
  RealSpectrum,
  analyzeSamples,
  averageSpectrum,
  detectKey,
  detectSpectralCutoff,
  downsampleByTwo,
  envelope,
  mixInPoint,
  mixOutPoint,
  onsetAndChroma,
  tempoAndPhase,
} from "@/lib/analyzer";
import { ANALYZER_VERSION } from "@/lib/analysis";

/** Reference implementation, only ever used to check the fast one. */
function naiveMagnitudes(frame: Float64Array): number[] {
  const n = frame.length;
  const magnitudes: number[] = [];
  for (let k = 0; k < n / 2; k++) {
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < n; i++) {
      const angle = (-2 * Math.PI * k * i) / n;
      real += frame[i] * Math.cos(angle);
      imaginary += frame[i] * Math.sin(angle);
    }
    magnitudes.push(Math.hypot(real, imaginary));
  }
  return magnitudes;
}

/** A click every `bpm` beats: a short decaying burst of noise, silence in between — the signal
 * a beat tracker should find easiest, and the floor its correctness rests on. */
function clickTrack(options: {
  bpm: number;
  seconds: number;
  sampleRate?: number;
  offsetSeconds?: number;
}): Float32Array {
  const sampleRate = options.sampleRate ?? ANALYSIS_SAMPLE_RATE;
  const samples = new Float32Array(Math.round(options.seconds * sampleRate));
  const interval = (60 / options.bpm) * sampleRate;
  const clickLength = Math.round(sampleRate * 0.02);
  // Deterministic pseudo-noise: a test that fails one run in twenty is worse than no test.
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  for (
    let position = (options.offsetSeconds ?? 0) * sampleRate;
    position < samples.length;
    position += interval
  ) {
    const start = Math.round(position);
    for (let i = 0; i < clickLength && start + i < samples.length; i++) {
      samples[start + i] = random() * 2 * Math.exp(-i / (clickLength / 4));
    }
  }
  return samples;
}

function sineSum(frequencies: number[], seconds: number, sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    let value = 0;
    for (const frequency of frequencies) {
      value += Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }
    samples[i] = value / frequencies.length;
  }
  return samples;
}

/** Deterministic white noise — broadband material, which is what the cutoff measurement's
 * median-of-the-midband reference assumes. A handful of pure tones leaves that reference sitting
 * on the FFT's own numerical noise floor, where any threshold relative to it is meaningless. */
function whiteNoise(seconds: number, sampleRate: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  let seed = 987654321;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    samples[i] = seed / 2147483648 - 0.5;
  }
  return samples;
}

/** Blackman-windowed sinc low-pass — steep enough (~-74dB stopband) to leave the kind of hard
 * wall a lossy encoder does, which is the thing being detected. */
function lowPassed(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  const taps = 201;
  const middle = (taps - 1) / 2;
  const kernel = new Float64Array(taps);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const n = i - middle;
    const sinc = n === 0 ? 2 * (cutoffHz / sampleRate) : Math.sin((2 * Math.PI * cutoffHz * n) / sampleRate) / (Math.PI * n);
    const window =
      0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    kernel[i] = sinc * window;
    sum += kernel[i];
  }
  for (let i = 0; i < taps; i++) kernel[i] /= sum;

  const output = new Float32Array(samples.length);
  for (let i = middle; i < samples.length - middle; i++) {
    let value = 0;
    for (let k = 0; k < taps; k++) value += samples[i - middle + k] * kernel[k];
    output[i] = value;
  }
  return output;
}

describe("RealSpectrum", () => {
  it("matches a naive DFT on a real-valued frame", () => {
    const size = 64;
    const frame = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      frame[i] = Math.sin((2 * Math.PI * 5 * i) / size) + 0.3 * Math.cos((2 * Math.PI * 11 * i) / size);
    }
    const expected = naiveMagnitudes(frame);
    const actual = new RealSpectrum(size).compute(frame);
    for (let bin = 0; bin < size / 2; bin++) {
      expect(actual[bin]).toBeCloseTo(expected[bin], 6);
    }
  });

  it("puts a pure tone's energy in the bin its frequency belongs to", () => {
    const size = 1024;
    const rate = 44_100;
    const frequency = (rate / size) * 40;
    const frame = new Float64Array(size);
    for (let i = 0; i < size; i++) frame[i] = Math.sin((2 * Math.PI * frequency * i) / rate);
    const magnitudes = new RealSpectrum(size).compute(frame);
    let peak = 0;
    for (let bin = 1; bin < size / 2; bin++) if (magnitudes[bin] > magnitudes[peak]) peak = bin;
    expect(peak).toBe(40);
  });
});

describe("tempoAndPhase", () => {
  it("recovers the tempo of a click track", () => {
    const { flux } = onsetAndChroma(clickTrack({ bpm: 120, seconds: 30 }));
    const { bpm } = tempoAndPhase(flux);
    expect(bpm).toBeDefined();
    expect(bpm!).toBeGreaterThan(118);
    expect(bpm!).toBeLessThan(122);
  });

  it("finds the beat phase of a track whose first click is late", () => {
    const offset = 0.25;
    const { flux } = onsetAndChroma(clickTrack({ bpm: 120, seconds: 30, offsetSeconds: offset }));
    const { bpm, firstBeatSeconds } = tempoAndPhase(flux);
    expect(bpm).toBeDefined();
    expect(firstBeatSeconds).toBeDefined();
    // The grid repeats every beat, so any offset a whole number of beats away is the same grid.
    const beat = 60 / bpm!;
    const phaseError = Math.abs(((firstBeatSeconds! - offset) % beat) + beat) % beat;
    // Within a frame length. A click first shows up in the flux at the frame whose *window* it
    // entered, not the frame that starts on it, so every detected onset sits up to FRAME_SIZE
    // early — a systematic bias, identical for every track, which is why alignment between two
    // of them survives it. (The same convention as the iOS analyzer, deliberately.)
    const frameSeconds = FRAME_SIZE / ANALYSIS_SAMPLE_RATE;
    expect(Math.min(phaseError, beat - phaseError)).toBeLessThan(frameSeconds);
  });

  it("reports no tempo for a held tone, rather than a number the mix would trust", () => {
    const drone = sineSum([220], 20, ANALYSIS_SAMPLE_RATE);
    const { flux } = onsetAndChroma(drone);
    expect(tempoAndPhase(flux).bpm).toBeUndefined();
  });

  it("reports no tempo for silence", () => {
    const { flux } = onsetAndChroma(new Float32Array(ANALYSIS_SAMPLE_RATE * 10));
    expect(tempoAndPhase(flux).bpm).toBeUndefined();
  });
});

describe("envelope", () => {
  it("normalizes the loudest bucket to 1", () => {
    const samples = new Float32Array(1000);
    for (let i = 0; i < samples.length; i++) samples[i] = i < 500 ? 0.25 : 0.5;
    const result = envelope(samples, 10);
    expect(result).toHaveLength(10);
    expect(Math.max(...result)).toBeCloseTo(1);
    expect(result[0]).toBeCloseTo(0.5);
  });

  it("returns nothing for empty input", () => {
    expect(envelope(new Float32Array(0), 10)).toEqual([]);
  });
});

describe("mixInPoint", () => {
  it("skips a quiet intro and lands where the arrangement arrives", () => {
    // 100 buckets over 100 seconds: quiet for the first 20, full from there.
    const values = Array.from({ length: 100 }, (_, index) => (index < 20 ? 0.2 : 1));
    const seconds = mixInPoint(values, 100, undefined, undefined);
    expect(seconds).toBeGreaterThanOrEqual(19);
    expect(seconds).toBeLessThanOrEqual(21);
  });

  it("never lands deeper than a quarter of the way in, however long the build", () => {
    const values = Array.from({ length: 100 }, (_, index) => (index < 60 ? 0.2 : 1));
    expect(mixInPoint(values, 100, undefined, undefined)).toBeLessThanOrEqual(25);
  });

  it("snaps forward to a bar line when there's a grid", () => {
    const values = Array.from({ length: 100 }, (_, index) => (index < 20 ? 0.2 : 1));
    // 120 BPM: a bar is 2 seconds, and the grid starts at 0.5.
    const seconds = mixInPoint(values, 100, 120, 0.5)!;
    expect((seconds - 0.5) % 2).toBeCloseTo(0);
    expect(seconds).toBeGreaterThanOrEqual(20);
  });
});

describe("mixOutPoint", () => {
  it("finds where the last full-strength section ends", () => {
    const values = Array.from({ length: 100 }, (_, index) => (index < 80 ? 1 : 0.2));
    const seconds = mixOutPoint(values, 100)!;
    expect(seconds).toBeGreaterThanOrEqual(79);
    expect(seconds).toBeLessThanOrEqual(81);
  });

  it("ignores a mid-track breakdown and keeps scanning backwards", () => {
    const values = Array.from({ length: 100 }, (_, index) => {
      if (index >= 40 && index < 50) return 0.2; // breakdown
      return index < 90 ? 1 : 0.2; // outro
    });
    expect(mixOutPoint(values, 100)!).toBeGreaterThan(85);
  });

  it("returns the end of the track when it stops hard", () => {
    const values = Array.from({ length: 100 }, () => 1);
    expect(mixOutPoint(values, 100)!).toBeCloseTo(100, 0);
  });

  it("never proposes mixing out in the first half", () => {
    const values = Array.from({ length: 100 }, (_, index) => (index < 10 ? 1 : 0.2));
    expect(mixOutPoint(values, 100)!).toBeGreaterThanOrEqual(50);
  });
});

describe("detectSpectralCutoff", () => {
  it("finds the wall a low-pass left in broadband material", () => {
    const samples = lowPassed(whiteNoise(3, CUTOFF_SAMPLE_RATE), 12_000, CUTOFF_SAMPLE_RATE);
    const cutoff = detectSpectralCutoff(averageSpectrum(samples), CUTOFF_SAMPLE_RATE)!;
    // The measured wall sits just above the filter's corner — a 201-tap FIR takes about a
    // kilohertz to reach its stopband, same as a real encoder's.
    expect(cutoff).toBeGreaterThan(11_000);
    expect(cutoff).toBeLessThan(14_000);
  });

  it("reports content reaching the top rather than calling it unmeasurable", () => {
    const cutoff = detectSpectralCutoff(
      averageSpectrum(whiteNoise(3, CUTOFF_SAMPLE_RATE)),
      CUTOFF_SAMPLE_RATE,
    )!;
    expect(cutoff).toBeGreaterThan(18_000);
  });

  it("is undefined when there aren't enough frames to average", () => {
    expect(averageSpectrum(new Float32Array(FRAME_SIZE))).toBeNull();
    expect(detectSpectralCutoff(null, CUTOFF_SAMPLE_RATE)).toBeUndefined();
  });
});

describe("detectKey", () => {
  it("reads a chroma vector shaped like a major profile as that major key", () => {
    // C major profile, unrotated -> Camelot 8B.
    const profile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const total = profile.reduce((sum, value) => sum + value, 0);
    expect(detectKey(profile.map((value) => value / total))).toBe("8B");
  });

  it("reads a rotated profile as the rotated key", () => {
    const profile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    // Rotate so the tonic is D (pitch class 2) -> Camelot 10B.
    const rotated = Array.from({ length: 12 }, (_, index) => profile[(index + 10) % 12]);
    const total = rotated.reduce((sum, value) => sum + value, 0);
    expect(detectKey(rotated.map((value) => value / total))).toBe("10B");
  });

  it("reports no key for a flat (atonal) distribution", () => {
    expect(detectKey(new Array(12).fill(1 / 12))).toBeUndefined();
  });

  it("reports no key for silence", () => {
    expect(detectKey(new Array(12).fill(0))).toBeUndefined();
  });
});

describe("downsampleByTwo", () => {
  it("halves the length", () => {
    expect(downsampleByTwo(new Float32Array(1000)).length).toBe(500);
  });

  it("preserves a low-frequency tone's amplitude", () => {
    const samples = sineSum([440], 0.5, CUTOFF_SAMPLE_RATE);
    const reduced = downsampleByTwo(samples);
    const peak = reduced.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    expect(peak).toBeGreaterThan(0.9);
  });
});

describe("analyzeSamples", () => {
  it("produces a complete analysis for a click track at full rate", () => {
    const samples = clickTrack({ bpm: 128, seconds: 20, sampleRate: CUTOFF_SAMPLE_RATE });
    const analysis = analyzeSamples({
      fileId: "track-1",
      samples,
      sampleRate: CUTOFF_SAMPLE_RATE,
    });
    expect(analysis.fileId).toBe("track-1");
    expect(analysis.version).toBe(ANALYZER_VERSION);
    expect(analysis.durationSeconds).toBeCloseTo(20, 1);
    expect(analysis.waveform.length).toBeGreaterThan(300);
    expect(analysis.bpm!).toBeGreaterThan(125);
    expect(analysis.bpm!).toBeLessThan(131);
  });

  it("still returns a waveform and duration when nothing else can be detected", () => {
    const analysis = analyzeSamples({
      fileId: "silent",
      samples: new Float32Array(CUTOFF_SAMPLE_RATE * 12),
      sampleRate: CUTOFF_SAMPLE_RATE,
    });
    expect(analysis.bpm).toBeUndefined();
    expect(analysis.camelotKey).toBeUndefined();
    expect(analysis.durationSeconds).toBeCloseTo(12, 1);
    expect(analysis.waveform.length).toBeGreaterThan(0);
  });
});

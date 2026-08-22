export const MAX_SPATIAL_INTENSITY = 100;
// Caps on how far the wet (convolved) signal can be pushed and how much the dry signal backs
// off to make room for it — kept well short of 100% wet/0% dry so the effect stays a widening
// blend rather than drowning the track in reverb.
const WET_MAX = 0.5;
const DRY_REDUCTION_MAX = 0.25;

export function clampSpatialIntensity(value: number): number {
  return Math.min(MAX_SPATIAL_INTENSITY, Math.max(0, value));
}

/**
 * Maps enabled/intensity to the convolver's wet/dry gains — pulled out as pure math (no
 * AudioContext involved) so it's testable directly.
 */
export function spatialGainsForIntensity(
  enabled: boolean,
  intensityPercent: number,
): { wet: number; dry: number } {
  const amount = enabled ? clampSpatialIntensity(intensityPercent) / 100 : 0;
  return {
    wet: amount * WET_MAX,
    dry: 1 - amount * DRY_REDUCTION_MAX,
  };
}

/**
 * Synthesizes a stereo impulse response for a `ConvolverNode` that gives an already-mixed
 * stereo track a sense of width/space — the closest a two-channel source can get to
 * Apple/Spotify-style "spatial audio" without an actual multi-object mix, since there's nothing
 * here to position in 3D (a `PannerNode`/`AudioListener` graph needs separate sound sources to
 * place, which a finished stereo mix doesn't have). Each channel gets its own independently
 * randomized decay noise; that L/R decorrelation is exactly what reads as "wide" rather than
 * "centered" — the same principle behind simple algorithmic hall reverbs.
 */
export function createSpatialImpulseResponse(context: BaseAudioContext): AudioBuffer {
  const duration = 1.4;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.5);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return impulse;
}

/**
 * A longer, darker impulse response for the per-slot transition reverb — the "wash" a mix's
 * outgoing track disappears into (see TransitionShape.outgoingReverb). Deliberately a separate
 * response from the spatial widener above: that one is short and bright because it must not be
 * heard as reverb at all, while this one is meant to be obvious.
 *
 * The native equivalent on iOS is `AVAudioUnitReverb`'s `.largeHall` factory preset; Web Audio
 * ships no reverb presets, so the hall is synthesized here — decorrelated noise with a longer
 * decay, rolled off in the top end the way a real room absorbs treble faster than bass.
 */
export function createHallImpulseResponse(context: BaseAudioContext): AudioBuffer {
  const duration = 2.6;
  const length = Math.floor(context.sampleRate * duration);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    // One-pole low-pass over the noise, run in-line: a hall's late reflections are darker than
    // its early ones, and undamped white noise reads as a burst of hiss rather than a room.
    let previous = 0;
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2);
      const noise = (Math.random() * 2 - 1) * decay;
      previous = previous * 0.6 + noise * 0.4;
      data[i] = previous;
    }
  }
  return impulse;
}

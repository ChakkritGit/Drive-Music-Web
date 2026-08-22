/**
 * Ordering a set of tracks so each one mixes into the next — the "auto sequence" a DJ does by
 * hand when building a set, and the thing the mix engine can't do for itself: it only ever sees
 * the pair in front of it, and by then the order is already decided.
 *
 * The whole problem is a path through a graph whose edges are "how well does A mix into B",
 * which is a travelling-salesman shape and therefore not something to solve exactly. What's here
 * is the standard pragmatic answer: score every ordered pair, walk greedily from a sensible
 * opener, then improve the result by relocating single tracks while that keeps paying. Good
 * orderings, in milliseconds, for playlists far larger than anyone actually has.
 *
 * Pure and side-effect free — no analysis is triggered from here. The caller is responsible for
 * having analyzed what it can (see SequenceMixButton), and tracks that arrive without an
 * analysis are honestly reported as unsequenced rather than shuffled in on guesses.
 */

import type { TrackAnalysis } from "@/types";
import { MAXIMUM_TEMPO_STRETCH } from "@/lib/transition";

/** What a missing measurement scores. Deliberately mid-range rather than 0: an unknown key is
 * not a *bad* key, and scoring it as one would push every un-keyed track to the end of the set
 * regardless of how well its tempo fits. */
const NEUTRAL = 0.5;

/** Beyond this tempo difference two tracks have no rhythmic relationship worth ordering for —
 * 12% is roughly 120 against 134 BPM, which is a different set, not a different track. */
const TEMPO_LIMIT = 0.12;

/** How much each measurement counts. Tempo first because it's what decides whether a transition
 * can be beat-aligned at all; key second because it decides whether the overlap sounds
 * harmonically intentional; energy last, as a preference about set shape rather than a
 * constraint about whether two tracks fit. */
const TEMPO_WEIGHT = 0.5;
const KEY_WEIGHT = 0.35;
const ENERGY_WEIGHT = 0.15;

/**
 * How well `from`'s tempo runs into `to`'s, 0..1.
 *
 * Octave-folded first: 140 into 70 BPM is the same pulse at half speed, mixes perfectly, and a
 * raw ratio would call it the worst pair in the set. Everything inside the engine's own
 * beatmatching range scores at least 0.7 — those are all *equally* playable, and splitting hairs
 * between a 1% and a 4% difference would let tempo outvote key among tracks that are all
 * already matched.
 */
export function tempoScore(from: TrackAnalysis | undefined, to: TrackAnalysis | undefined): number {
  const fromBpm = from?.bpm;
  const toBpm = to?.bpm;
  if (!fromBpm || !toBpm || fromBpm <= 0 || toBpm <= 0) return NEUTRAL;

  let ratio = toBpm / fromBpm;
  while (ratio > 1.5) ratio /= 2;
  while (ratio < 1 / 1.5) ratio *= 2;
  const distance = Math.abs(ratio - 1);

  if (distance <= MAXIMUM_TEMPO_STRETCH) return 1 - 0.3 * (distance / MAXIMUM_TEMPO_STRETCH);
  if (distance >= TEMPO_LIMIT) return 0;
  return 0.7 * (1 - (distance - MAXIMUM_TEMPO_STRETCH) / (TEMPO_LIMIT - MAXIMUM_TEMPO_STRETCH));
}

/**
 * How well two keys sit together on the Camelot wheel, 0..1.
 *
 * The wheel's whole point is that "compatible" is a glance: the same number is relative
 * major/minor, one step around is a fifth away. Two steps is a stretch DJs do make, so it scores
 * above unrelated rather than being ruled out — this orders a set, it doesn't referee one.
 */
export function keyScore(from: TrackAnalysis | undefined, to: TrackAnalysis | undefined): number {
  const a = parseCamelot(from?.camelotKey);
  const b = parseCamelot(to?.camelotKey);
  if (!a || !b) return NEUTRAL;
  if (a.number === b.number && a.letter === b.letter) return 1;
  // Relative major/minor — same tonal centre, different mode.
  if (a.number === b.number) return 0.9;
  if (a.letter !== b.letter) return 0.25;
  const steps = wheelDistance(a.number, b.number);
  if (steps === 1) return 0.85;
  if (steps === 2) return 0.5;
  return 0.25;
}

/**
 * How the pair reads as set shape, 0..1.
 *
 * A set that climbs slightly is the shape everyone building one is after; a big jump either way
 * reads as two sets stapled together. This is a nudge, not a rule — see ENERGY_WEIGHT.
 */
export function energyScore(
  from: TrackAnalysis | undefined,
  to: TrackAnalysis | undefined,
): number {
  const fromEnergy = trackEnergy(from);
  const toEnergy = trackEnergy(to);
  if (fromEnergy === null || toEnergy === null) return NEUTRAL;
  // The ideal step is a small rise, not none: an identical level track after track is as flat as
  // a set gets, and the wheel-spinning is audible.
  const delta = toEnergy - fromEnergy;
  return Math.max(0, 1 - Math.abs(delta - 0.03) / 0.35);
}

/**
 * A track's overall level, 0..1 — the median of its own loudness envelope.
 *
 * The envelope is normalized per track (its loudest point is always 1), so this is not loudness
 * in any absolute sense; it's how *sustained* a track is against its own peak. A dense, hard-
 * compressed club track sits high, a sparse one with big dynamics sits low, which is close
 * enough to "energy" for ordering a set and costs nothing extra to compute.
 */
export function trackEnergy(analysis: TrackAnalysis | undefined): number | null {
  if (!analysis || analysis.waveform.length === 0) return null;
  const sounding = analysis.waveform.filter((value) => value > 0.05).sort((a, b) => a - b);
  if (sounding.length === 0) return null;
  return sounding[Math.floor(sounding.length / 2)];
}

/** The single number the ordering maximizes over consecutive pairs. */
export function transitionScore(
  from: TrackAnalysis | undefined,
  to: TrackAnalysis | undefined,
): number {
  return (
    TEMPO_WEIGHT * tempoScore(from, to) +
    KEY_WEIGHT * keyScore(from, to) +
    ENERGY_WEIGHT * energyScore(from, to)
  );
}

/** Total score of a whole running order — the sum over its consecutive pairs. Exported mainly so
 * an ordering can be compared against another one (which is how this is tested). */
export function pathScore(fileIds: string[], analyses: Map<string, TrackAnalysis>): number {
  let total = 0;
  for (let i = 0; i + 1 < fileIds.length; i++) {
    total += transitionScore(analyses.get(fileIds[i]), analyses.get(fileIds[i + 1]));
  }
  return total;
}

export interface SequenceResult {
  /** Every id passed in, reordered. Tracks with no analysis keep their original order and sit at
   * the end — see `unsequenced`. */
  order: string[];
  /** The ids that couldn't be placed, because nothing is known about them. */
  unsequenced: string[];
}

/**
 * Orders `fileIds` so each track runs into the next as well as the analyses allow.
 *
 * Opens on the lowest-energy analyzed track — a set starts somewhere it can climb from — then
 * takes the best available next track at each step, and finally tries moving individual tracks
 * elsewhere in the order while that improves the total. Greedy alone reliably paints itself into
 * a corner (the last few tracks are whatever nothing else wanted); the relocation pass is what
 * cleans that up, and unlike a full 2-opt it stays linear in work per candidate move.
 */
export function sequenceTracks(
  fileIds: string[],
  analyses: Map<string, TrackAnalysis>,
): SequenceResult {
  const known = fileIds.filter((id) => analyses.has(id));
  const unsequenced = fileIds.filter((id) => !analyses.has(id));
  if (known.length <= 2) return { order: [...known, ...unsequenced], unsequenced };

  const remaining = new Set(known);
  let current = openingTrack(known, analyses);
  remaining.delete(current);
  const order = [current];

  while (remaining.size > 0) {
    let best: string | null = null;
    let bestScore = -Infinity;
    const fromAnalysis = analyses.get(current);
    for (const candidate of remaining) {
      const score = transitionScore(fromAnalysis, analyses.get(candidate));
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best === null) break;
    order.push(best);
    remaining.delete(best);
    current = best;
  }

  return { order: [...improve(order, analyses), ...unsequenced], unsequenced };
}

/** The lowest-energy track, or simply the first when no energies are known. */
function openingTrack(fileIds: string[], analyses: Map<string, TrackAnalysis>): string {
  let opener = fileIds[0];
  let lowest = Infinity;
  for (const id of fileIds) {
    const energy = trackEnergy(analyses.get(id));
    if (energy === null) continue;
    if (energy < lowest) {
      lowest = energy;
      opener = id;
    }
  }
  return opener;
}

/** How many relocation passes to run. Each is O(n²); two is where the improvement stopped being
 * worth the work on realistic playlists. */
const IMPROVEMENT_PASSES = 2;

/** Anything smaller than this isn't an improvement, it's floating-point noise — and accepting it
 * would let the loop shuffle two equivalent orders back and forth forever. */
const IMPROVEMENT_EPSILON = 1e-9;

/** Repeatedly lifts one track out of the order and drops it wherever it fits best, while that
 * keeps improving the total.
 *
 * Scored by the three edges a move actually touches rather than by re-summing the whole path:
 * the difference is O(n²) against O(n³) per pass, which on a few hundred tracks is the
 * difference between "instant" and "the button hangs". */
function improve(order: string[], analyses: Map<string, TrackAnalysis>): string[] {
  const result = [...order];
  const edge = (a: string | undefined, b: string | undefined): number =>
    a === undefined || b === undefined ? 0 : transitionScore(analyses.get(a), analyses.get(b));

  for (let pass = 0; pass < IMPROVEMENT_PASSES; pass++) {
    let improved = false;
    for (let from = 0; from < result.length; from++) {
      const moved = result[from];
      // Closing the gap the track leaves behind: two edges disappear, one appears.
      const removalGain =
        edge(result[from - 1], result[from + 1]) -
        edge(result[from - 1], moved) -
        edge(moved, result[from + 1]);

      const withoutTrack = [...result.slice(0, from), ...result.slice(from + 1)];
      let bestGain = IMPROVEMENT_EPSILON;
      let bestPosition = -1;
      for (let to = 0; to <= withoutTrack.length; to++) {
        if (to === from) continue; // where it already is
        const insertionGain =
          edge(withoutTrack[to - 1], moved) +
          edge(moved, withoutTrack[to]) -
          edge(withoutTrack[to - 1], withoutTrack[to]);
        const gain = removalGain + insertionGain;
        if (gain > bestGain) {
          bestGain = gain;
          bestPosition = to;
        }
      }
      if (bestPosition >= 0) {
        result.splice(from, 1);
        result.splice(bestPosition, 0, moved);
        improved = true;
      }
    }
    if (!improved) break;
  }
  return result;
}

function wheelDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 12 - raw);
}

function parseCamelot(value: string | undefined): { number: number; letter: string } | null {
  if (!value) return null;
  const letter = value.slice(-1);
  if (letter !== "A" && letter !== "B") return null;
  const number = Number(value.slice(0, -1));
  if (!Number.isInteger(number) || number < 1 || number > 12) return null;
  return { number, letter };
}

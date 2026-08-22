/**
 * The geometry of the neon strands that travel around the play button while mixing is on — see
 * MixGlow, which draws them, and `HelixRing` in the iOS app, which this is a port of.
 *
 * A circle with two sine waves added to its radius. Their periods don't divide into each other,
 * so the shape never returns to a previous arrangement: what a viewer sees is a slow, aimless
 * crawl rather than a loop, which is the whole point — a fixed braid that merely spins reads as
 * a spinner, and a spinner means "waiting".
 *
 * Pure so the shape can be reasoned about (and tested) without a browser: the component's only
 * job is to call this every frame and set the result on a `<path>`.
 */

/** Waves per turn, and how far each swings either side of the base radius as a fraction of it.
 * Their sum bounds the strand — enough to read as movement, not so much that it collides with
 * the button or wanders outside the halo. */
export const PRIMARY_LOBES = 5;
export const SECONDARY_LOBES = 3;
export const PRIMARY_AMPLITUDE = 0.075;
export const SECONDARY_AMPLITUDE = 0.045;

/** Paths are built in a 100×100 viewBox, so the whole thing scales with whatever size the
 * button is. The base radius leaves room for both amplitudes at full swing. */
export const HELIX_CENTER = 50;
export const HELIX_BASE_RADIUS = 44;

/** 2° steps: fine enough that the curve reads as smooth at this diameter, coarse enough that
 * rebuilding it every frame stays cheap. */
const STEP_DEGREES = 2;

export interface HelixStrand {
  /** Turns per second of each wave. Deliberately awkward fractions in opposing directions —
   * nothing here divides evenly into anything else. */
  primarySpeed: number;
  secondarySpeed: number;
  /** Starting phase, which is what keeps the two strands from being the same line. */
  offset: number;
}

/** The two strands. Nothing is shared between them but the circle they travel on, so they drift
 * together and apart on their own schedules. */
export const HELIX_STRANDS: HelixStrand[] = [
  { primarySpeed: 1 / 7, secondarySpeed: -1 / 11, offset: 0 },
  { primarySpeed: -1 / 9, secondarySpeed: 1 / 13, offset: Math.PI },
];

/** The strand's SVG path at `seconds` of wall-clock time. */
export function helixPath(seconds: number, strand: HelixStrand): string {
  const primaryPhase = seconds * strand.primarySpeed * 2 * Math.PI + strand.offset;
  const secondaryPhase = seconds * strand.secondarySpeed * 2 * Math.PI + strand.offset;

  let path = "";
  for (let angle = 0; angle <= 360; angle += STEP_DEGREES) {
    const radians = (angle * Math.PI) / 180;
    const radius =
      HELIX_BASE_RADIUS *
      (1 +
        PRIMARY_AMPLITUDE * Math.sin(PRIMARY_LOBES * radians + primaryPhase) +
        SECONDARY_AMPLITUDE * Math.sin(SECONDARY_LOBES * radians + secondaryPhase));
    const x = HELIX_CENTER + radius * Math.cos(radians);
    const y = HELIX_CENTER + radius * Math.sin(radians);
    path += `${angle === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${path}Z`;
}

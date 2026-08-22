"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { HELIX_STRANDS, helixPath } from "@/lib/helix";

/**
 * The neon halo behind the play/pause button while mixing is on — the "this is doing something
 * extra" signal, in the one place the user is already looking.
 *
 * Ported from `mixGlow` / `HelixRing` in the iOS app's NowPlayingView. Three stacked circles
 * rather than one: a single blurred ring reads as a soft shadow, while a tight bright core with
 * progressively wider, dimmer rings around it is what actually looks like emitted light. Two
 * strands travel that circle, each drawn three times — a wide blurred pass for the light it
 * throws, a medium one, and a thin sharp line for the filament — the same build-up a real neon
 * tube has, and the reason a single stroked line with a blur never looks lit.
 *
 * Brightness is *constant*. An earlier version of the iOS one pulsed, which read as a flicker: a
 * real neon tube either glows steadily or it's broken, and the movement is what carries the sense
 * of something running.
 */

/** How long the strands take to slide out from behind the button, and back in. */
const RETRACT_MS = 550;

/** The three passes each strand is drawn with, widest and dimmest first. Widths are viewBox
 * units; blurs are CSS pixels on the rendered size. */
const STRAND_PASSES = [
  { width: 5, opacity: 0.5, blur: 5 },
  { width: 2.6, opacity: 0.8, blur: 1.5 },
  { width: 1, opacity: 0.95, blur: 0 },
];

export function MixGlow({ active }: { active: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  // Whether the strands are out, written a frame late and as an attribute rather than as state.
  //
  // A frame late because an element that renders already-expanded has no earlier state to
  // animate from: opening Now Playing mid-playback would pop the strands in at full size instead
  // of sliding them out from behind the button. Rendering retracted and expanding on the next
  // frame is what gives the browser two states to interpolate between.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const frame = requestAnimationFrame(() => {
      wrapper.dataset.shown = active ? "true" : "false";
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>("path[data-strand]"));

    const render = (seconds: number) => {
      const shapes = HELIX_STRANDS.map((strand) => helixPath(seconds, strand));
      for (const path of paths) {
        const index = Number(path.dataset.strand);
        path.setAttribute("d", shapes[index]);
      }
    };

    // A pure function of wall-clock time rather than a CSS keyframe animation, for the same
    // reason the iOS version uses TimelineView over `.repeatForever`: the two strands' periods
    // don't divide into each other, so there is no loop length a keyframe could describe.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      render(0);
      return;
    }

    let frame = 0;
    const tick = () => {
      render(performance.now() / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // While paused the strands are invisible, but they still have to finish retracting — so the
    // loop outlives `active` by the length of that transition and then stops. A player left
    // paused on this screen shouldn't hold a frame callback open indefinitely for something
    // nobody can see.
    let stop = 0;
    if (!active) {
      stop = window.setTimeout(() => cancelAnimationFrame(frame), RETRACT_MS + 50);
    }
    return () => {
      window.clearTimeout(stop);
      cancelAnimationFrame(frame);
    };
  }, [active]);

  return (
    <span
      ref={wrapperRef}
      aria-hidden="true"
      className={clsx(
        // Never intercepts the tap: it extends well past the button, and a glow that swallowed
        // presses near the edge would make the main transport control feel unreliable.
        // Behind the button rather than over it — see the `relative z-10` on the button itself.
        "pointer-events-none absolute inset-0 z-0 text-accent",
        // Retracts to just inside the button rather than to nothing: shrinking to zero reads as
        // the strands being sucked into a point, while stopping at the button's edge reads as
        // them sliding out from behind it and back in, which is what's meant.
        //
        // The bare `transition` utility, not `transition-[opacity,transform]`: Tailwind v4
        // compiles `scale-*` to the standalone CSS `scale` property rather than into `transform`,
        // so naming `transform` transitions nothing and the strands snapped to size instead of
        // growing out. `transition` covers opacity, scale and filter together.
        "transition ease-out motion-reduce:transition-none",
        // `scale-72`, not `scale-[0.72]`: the arbitrary form emits a bare `scale: .72` while the
        // utility form emits percentages through --tw-scale-*, and interpolating one against the
        // other is not something every engine does smoothly. Same form on both sides.
        "scale-72 opacity-0 data-[shown=true]:scale-100 data-[shown=true]:opacity-100",
      )}
      style={{ transitionDuration: `${RETRACT_MS}ms` }}
    >
      {/* The halo. Percentages of the button's own box, so this tracks whatever size it is. */}
      {[
        { size: "108%", opacity: "0.5", blur: "10px" },
        { size: "128%", opacity: "0.3", blur: "20px" },
        { size: "156%", opacity: "0.18", blur: "34px" },
      ].map((halo) => (
        <span
          key={halo.size}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
          style={{
            width: halo.size,
            height: halo.size,
            opacity: halo.opacity,
            filter: `blur(${halo.blur})`,
          }}
        />
      ))}

      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        fill="none"
        className="absolute left-1/2 top-1/2 h-[134%] w-[134%] -translate-x-1/2 -translate-y-1/2 overflow-visible"
      >
        {HELIX_STRANDS.map((_, strandIndex) =>
          STRAND_PASSES.map((pass) => (
            <path
              key={`${strandIndex}-${pass.width}`}
              data-strand={strandIndex}
              d={helixPath(0, HELIX_STRANDS[strandIndex])}
              stroke="currentColor"
              strokeOpacity={pass.opacity}
              strokeWidth={pass.width}
              strokeLinejoin="round"
              style={pass.blur > 0 ? { filter: `blur(${pass.blur}px)` } : undefined}
            />
          )),
        )}
      </svg>
    </span>
  );
}

"use client";

import { Pause, Play } from "lucide-react";
import clsx from "clsx";

/**
 * The play/pause glyph, swapped with a transition instead of cut.
 *
 * Both glyphs are always in the DOM, stacked; the outgoing one shrinks and fades while the
 * incoming one grows into place. That's the same move SF Symbols makes for a `.replace`
 * transition on iOS, and it's why the native button reads as a control changing state while a
 * plain conditional swap reads as one icon being replaced by a different icon.
 *
 * Rendering both (rather than animating one on a key change) is what makes the two halves
 * overlap: a React key swap unmounts the old glyph immediately, so there is nothing left to
 * animate out. `prefers-reduced-motion` drops the transition and the swap becomes instant.
 */
export function PlayPauseIcon({
  playing,
  className,
}: {
  playing: boolean;
  /** Sizes the icon — pass the same height/width you'd give a lucide icon (e.g. "h-6 w-6"). */
  className?: string;
}) {
  return (
    <span className={clsx("relative block", className)} aria-hidden="true">
      <Play
        className={clsx(
          "absolute inset-0 h-full w-full transition duration-200 ease-out motion-reduce:transition-none",
          playing ? "scale-50 opacity-0" : "scale-100 opacity-100",
        )}
      />
      <Pause
        className={clsx(
          "absolute inset-0 h-full w-full transition duration-200 ease-out motion-reduce:transition-none",
          playing ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      />
    </span>
  );
}

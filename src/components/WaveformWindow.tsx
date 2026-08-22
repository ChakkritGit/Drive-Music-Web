"use client";

import { useCallback, useEffect, useRef } from "react";
import clsx from "clsx";

interface WaveformWindowProps {
  /** Normalized 0..1 samples spanning the entire track — TrackAnalysis.waveform. */
  samples: number[];
  /** Length of the whole track, which is what maps a sample index to a time. */
  duration: number;
  /** Time currently under the centre line. */
  position: number;
  /** How much of the track is visible. 30 seconds is enough context to recognise where you are
   * in a song — an intro, a chorus — while still making a single pixel worth well under a beat. */
  windowSeconds?: number;
  /** Reports the time under the line as the track is dragged. */
  onScrub?: (seconds: number) => void;
  /** Fired once when the drag ends, for callers that persist the result. */
  onScrubEnd?: () => void;
  label?: string;
  className?: string;
}

/**
 * A zoomed, scrollable window onto a track's waveform with a fixed line down the middle.
 *
 * A whole-track view shows a four-minute song across a few hundred pixels: a single pixel is
 * worth about a second, so placing a mix start means aiming at a target a beat and a half wide.
 * Here the track scrolls *under* a stationary line and only `windowSeconds` of it are visible at
 * a time — the arrangement every DJ tool uses, because it's the one where the thing being chosen
 * stays put while the material moves past it. Precision comes from how far you drag rather than
 * how accurately you can land a pointer.
 *
 * The line's meaning is exactly "the mix starts here": whatever audio sits under it is the
 * moment `position` reports.
 */
export function WaveformWindow({
  samples,
  duration,
  position,
  windowSeconds = 30,
  onScrub,
  onScrubEnd,
  label,
  className,
}: WaveformWindowProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Where `position` was when the current drag began. Dragging is relative to that rather than
   * to wherever the pointer first landed, so a drag can't jump the waveform to meet the cursor. */
  const dragRef = useRef<{ pointerId: number; startX: number; anchor: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    // The accent, read off the canvas's own computed style — the app's palette lives in CSS
    // variables that swap per theme, and a canvas can't inherit a fill from a class.
    const accent = getComputedStyle(canvas).color;
    const secondsPerPixel = windowSeconds / width;
    const middle = height / 2;

    for (let x = 0; x < width; x++) {
      const time = position + (x - width / 2) * secondsPerPixel;
      if (time < 0 || time > duration || duration <= 0 || samples.length === 0) continue;
      const index = Math.min(samples.length - 1, Math.floor((time / duration) * samples.length));
      const amplitude = samples[index] ?? 0;
      const barHeight = Math.max(1, amplitude * (height - 6));
      // Ahead of the line is what the mix will play *into*; behind it is what's already gone.
      // Dimming the past is the cheapest way to say which side of the line you're choosing.
      context.globalAlpha = time < position ? 0.35 : 0.85;
      context.fillStyle = accent;
      context.fillRect(x, middle - barHeight / 2, 1, barHeight);
    }

    context.globalAlpha = 1;
    context.fillStyle = accent;
    context.fillRect(Math.round(width / 2), 0, 1, height);
  }, [samples, duration, position, windowSeconds]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (duration <= 0 || samples.length === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, anchor: position };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = event.currentTarget.clientWidth;
    if (width === 0) return;
    // Dragging right pulls the track rightwards, which brings *earlier* audio under the line —
    // the same direction as scrubbing a physical reel, and the opposite sign to the travel.
    const secondsPerPixel = windowSeconds / width;
    const target = drag.anchor - (event.clientX - drag.startX) * secondsPerPixel;
    onScrub?.(Math.min(Math.max(0, target), duration));
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    onScrubEnd?.();
  };

  return (
    <div className={clsx("relative", className)}>
      <canvas
        ref={canvasRef}
        // `text-accent` is what the canvas reads its fill from — see draw().
        className="h-16 w-full cursor-ew-resize touch-none rounded-lg bg-zinc-100 text-accent dark:bg-zinc-900"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      {label && (
        <span className="pointer-events-none absolute left-2 top-1.5 text-[10px] uppercase tracking-wide text-zinc-400">
          {label}
        </span>
      )}
      <span className="pointer-events-none absolute right-2 top-1.5 text-[10px] tabular-nums text-zinc-400">
        {formatTime(position)}
      </span>
      {(duration <= 0 || samples.length === 0) && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
          Not analyzed yet
        </span>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const SEEK_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

type Gesture = { kind: "pointer"; pointerId: number } | { kind: "keyboard" };

/** Keep scrubbing local so each gesture seeks the audio (and other devices) only once. */
export function SeekSlider({ value, duration, onSeek, className }: {
  value: number;
  duration: number;
  onSeek: (time: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const finish = useCallback((cancel = false) => {
    const time = draftRef.current;
    gesture.current = null;
    draftRef.current = null;
    setDraft(null);
    if (!cancel && time !== null) onSeek(time);
  }, [onSeek]);

  useEffect(() => {
    // Capture normally brings releases back to the input. These also cover browsers
    // that cannot capture the pointer, and releases outside the slider.
    const onPointerUp = (event: PointerEvent) => {
      if (gesture.current?.kind === "pointer" && gesture.current.pointerId === event.pointerId) finish();
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (gesture.current?.kind === "pointer" && gesture.current.pointerId === event.pointerId) finish(true);
    };
    const onWindowBlur = () => {
      if (gesture.current) finish(gesture.current.kind === "pointer");
    };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [finish]);

  const maximum = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const displayed = Math.max(0, Math.min(draft ?? value, maximum));

  return <input
    type="range"
    min={0}
    max={maximum}
    step={0.1}
    value={displayed}
    className={className}
    style={{ "--pct": `${maximum ? displayed / maximum * 100 : 0}%` } as CSSProperties}
    aria-label="Seek"
    onPointerDown={(event) => {
      if (event.button !== 0 || gesture.current?.kind === "pointer") return;
      if (gesture.current) finish();
      gesture.current = { kind: "pointer", pointerId: event.pointerId };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Window listener handles release. */ }
    }}
    onPointerUp={(event) => {
      if (gesture.current?.kind === "pointer" && gesture.current.pointerId === event.pointerId) finish();
    }}
    onPointerCancel={(event) => {
      if (gesture.current?.kind === "pointer" && gesture.current.pointerId === event.pointerId) finish(true);
    }}
    onKeyDown={(event) => {
      if (SEEK_KEYS.has(event.key) && !gesture.current) gesture.current = { kind: "keyboard" };
    }}
    onKeyUp={(event) => {
      if (SEEK_KEYS.has(event.key) && gesture.current?.kind === "keyboard") finish();
    }}
    onBlur={() => {
      if (gesture.current?.kind === "keyboard") finish();
    }}
    onChange={(event) => {
      const time = Number(event.currentTarget.value);
      if (gesture.current) {
        draftRef.current = time;
        setDraft(time);
      } else {
        // Assistive technology can change a range without pointer or key events.
        onSeek(time);
      }
    }}
  />;
}

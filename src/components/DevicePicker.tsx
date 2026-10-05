"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Laptop, MonitorSpeaker, VolumeX } from "lucide-react";
import clsx from "clsx";
import { useSync } from "@/components/SyncContext";

/**
 * Where the music is heard. Either this device alone, or this device with the other one kept in
 * step and silent. While another device leads, this one says so and can take the sound back.
 */
export function DevicePicker() {
  const { mode, chooseMode, leaderName, remoteNowPlaying, syncAvailable } = useSync();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const other = remoteNowPlaying?.deviceName ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!syncAvailable) return null;
  const pick = (next: "solo" | "lead") => {
    chooseMode(next);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Choose where it plays"
        aria-expanded={open}
        title="Devices"
        className={clsx(
          "grid h-9 w-9 place-items-center rounded-full transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
          mode !== "solo" || open
            ? "text-accent-strong"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
        )}
      >
        {mode === "follow" ? <VolumeX className="h-[18px] w-[18px]" /> : <MonitorSpeaker className="h-[18px] w-[18px]" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Devices"
          className="absolute right-0 bottom-full mb-3 w-80 animate-[fadeIn_150ms_ease-out] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">Play on</p>

          {mode === "follow" && (
            <div className="m-1 rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
              <p className="flex items-center gap-2 font-medium text-zinc-950 dark:text-zinc-50">
                <VolumeX className="h-4 w-4 text-accent-strong" /> Muted here
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                In step with {leaderName ?? "the other device"}, which is the one you hear.
              </p>
            </div>
          )}

          <Option
            selected={mode === "solo"}
            icon={<Laptop className="h-4 w-4" />}
            title="This device only"
            hint={remoteNowPlaying?.isPlaying && other ? `Moves the music here. ${other} stops.` : "Plays here, on its own."}
            onClick={() => pick("solo")}
          />
          <Option
            selected={mode === "lead"}
            icon={<MonitorSpeaker className="h-4 w-4" />}
            title={other ? `Here, with ${other} in sync` : "Here, with another device in sync"}
            hint={other ? `Sound from this device. ${other} follows along, muted.` : "Open Drive Music on another device to sync."}
            disabled={!other}
            onClick={() => pick("lead")}
          />
        </div>
      )}
    </div>
  );
}

function Option({
  selected,
  icon,
  title,
  hint,
  disabled = false,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-zinc-900"
    >
      <span className={clsx("mt-0.5", selected ? "text-accent-strong" : "text-zinc-500 dark:text-zinc-400")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={clsx("block text-sm font-medium", selected ? "text-accent-strong" : "text-zinc-950 dark:text-zinc-50")}>
          {title}
        </span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>
      </span>
      {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />}
    </button>
  );
}

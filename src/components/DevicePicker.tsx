"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Laptop, MonitorSpeaker } from "lucide-react";
import clsx from "clsx";
import { useSync } from "@/components/SyncContext";

/** Shared by the bottom bar and Now Playing, including on small screens. */
export function DevicePicker() {
  const { devices, deviceId, outputId, pendingOutputId, selectOutput, connected, syncAvailable } = useSync();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPosition({ top: Math.max(8, Math.min(rect.top - (menu.current?.offsetHeight ?? 250) - 8, window.innerHeight - (menu.current?.offsetHeight ?? 250) - 8)), left: Math.max(8, Math.min(rect.right - 320, window.innerWidth - 328)) });
  }, [open, devices.length, connected]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && (button.current?.contains(e.target as Node) || menu.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); window.removeEventListener("resize", close); };
  }, [open]);
  if (!syncAvailable) return null;
  return <>
    <button ref={button} onClick={() => setOpen(v => !v)} aria-label="Choose output device" aria-expanded={open} title="Devices"
      className={clsx("grid h-9 w-9 place-items-center rounded-full transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-zinc-900", outputId || open ? "text-accent-strong" : "text-zinc-500")}>
      <MonitorSpeaker className="h-[18px] w-[18px]" />
    </button>
    {open && createPortal(<div ref={menu} role="dialog" aria-label="Devices" style={position}
      className="fixed z-[100] max-h-[calc(100dvh-1rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
      <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Play on</p>
      <p className="px-3 pb-2 text-xs text-zinc-500">{connected ? "One output. Control the shared queue from any device." : "Connecting to Party Play…"}</p>
      {devices.map(device => <button key={device.id} disabled={!connected} aria-pressed={outputId === device.id}
        onClick={() => { selectOutput(device.id); setOpen(false); }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900">
        <Laptop className="h-4 w-4 shrink-0 text-zinc-500" />
        <span className="min-w-0 flex-1"><span className="block truncate">{device.name}{device.id === deviceId ? " (this device)" : ""}</span>
          <span className="block text-xs text-zinc-500">{pendingOutputId === device.id ? "Switching output…" : outputId === device.id ? "Audio output" : "Connected · silent"}</span></span>
        {outputId === device.id && <Check className="h-4 w-4 text-accent-strong" />}
      </button>)}
    </div>, document.body)}
  </>;
}

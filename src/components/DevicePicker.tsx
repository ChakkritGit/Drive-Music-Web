"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Laptop, MonitorSpeaker, Smartphone, Tablet, Volume2 } from "lucide-react";
import clsx from "clsx";
import { useSync } from "@/components/SyncContext";
import { usePlayer } from "@/components/PlayerContext";
import { describeDevice, type DeviceKind } from "@/lib/party";

/** Shared by the bottom bar and Now Playing, including on small screens. */
export function DevicePicker() {
  const { devices, deviceId, outputId, pendingOutputId, selectOutput, connected, syncAvailable, localPlayback } = useSync();
  const { isPlaying, volume, changeVolume } = usePlayer();
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
  // offline / not yet connected: describe this device locally
  const localDevice = devices.find(device => device.id === deviceId) ?? { id: "__local__", ...describeDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0) };
  const active = localPlayback ? localDevice : devices.find(device => device.id === outputId) ?? null;
  const others = [localDevice, ...devices.filter(device => device.id !== deviceId)].filter(device => device.id !== active?.id);
  const status = pendingOutputId ? "Switching…" : !connected && !localPlayback ? "Reconnecting…" : isPlaying ? "Playing" : "Paused";
  return <>
    <button ref={button} onClick={() => setOpen(v => !v)} aria-label="Connect to a device" aria-expanded={open} title="Connect to a device"
      className={clsx("grid h-9 w-9 place-items-center rounded-full transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-zinc-900", !localPlayback || open ? "text-accent-strong" : "text-zinc-500")}>
      <MonitorSpeaker className="h-[18px] w-[18px]" />
    </button>
    {open && createPortal(<div ref={menu} role="dialog" aria-label="Connect to a device" style={position}
      className="fixed z-[100] max-h-[calc(100dvh-1rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
      {/* Spotify Connect: the device the sound is on, then everything you can move it to. */}
      <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Current device</p>
      {active && <div className="flex items-center gap-3 rounded-xl bg-accent/10 px-3 py-3">
        <DeviceIcon kind={active.kind} className="h-5 w-5 shrink-0 text-accent-strong" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-accent-strong">{active.id === localDevice.id ? "This device" : active.name}</span>
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">{isPlaying && !pendingOutputId && <Equalizer />}{status}</span>
        </span>
      </div>}
      {active && <label className="flex items-center gap-3 px-3 pt-3 pb-2 text-zinc-500">
        <Volume2 className="h-4 w-4 shrink-0" />
        <input type="range" min={0} max={1} step={0.01} value={volume} onChange={e => changeVolume(Number(e.target.value))}
          className="seek flex-1" aria-label={`Volume on ${active.id === localDevice.id ? "this device" : active.name}`} style={{ "--pct": `${volume * 100}%` } as React.CSSProperties} />
      </label>}
      <p className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wider text-zinc-500 uppercase">Select another device</p>
      {others.map(device => {
        const here = device.id === localDevice.id;
        return <button key={device.id} disabled={!here && !connected}
          onClick={() => { selectOutput(device.id); setOpen(false); }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900">
          <DeviceIcon kind={device.kind} className="h-5 w-5 shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1"><span className="block truncate">{here ? "This device" : device.name}</span>
            <span className="block text-xs text-zinc-500">{pendingOutputId === device.id ? "Connecting…" : here && !connected ? "Downloaded music · available offline" : here ? device.name : "Drive Music"}</span></span>
        </button>;
      })}
      {devices.filter(d => d.id !== deviceId).length === 0 && <p className="px-3 pt-1 pb-3 text-xs leading-relaxed text-zinc-500">
        {connected ? "Open Drive Music on another phone or computer signed in with the same Google account, and it shows up here." : "Connecting to your other devices…"}
      </p>}
    </div>, document.body)}
  </>;
}

/** Phone, tablet or computer, like Spotify's device list. */
export function DeviceIcon({ kind, className }: { kind?: DeviceKind | null; className?: string }) {
  const Icon = kind === "phone" ? Smartphone : kind === "tablet" ? Tablet : Laptop;
  return <Icon className={className} aria-hidden="true" />;
}

/** Three bars that bounce while the current device is playing. */
function Equalizer() {
  return <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
    {[0, 1, 2].map(i => <span key={i} className="eq-bar w-[3px] rounded-sm bg-accent" style={{ animationDelay: `${i * 0.18}s` }} />)}
  </span>;
}

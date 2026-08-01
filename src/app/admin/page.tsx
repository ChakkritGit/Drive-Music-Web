"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, PlayCircle } from "lucide-react";
import { SignInScreen } from "@/components/SignInScreen";
import { FEATURE_GROUPS, FEATURE_SIZE } from "@/lib/features";
import { HIDDEN_SIZE } from "@/lib/model";
import {
  listCachedTracks,
  listModelEvents,
  listPlaylists,
  listRecentSources,
} from "@/lib/db";
import { usePlayer } from "@/components/PlayerContext";
import type {
  CachedTrack,
  ListeningModel,
  ModelEvent,
  Playlist,
  RecentSource,
} from "@/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/** Averages |w1[h][i]| across every hidden unit h, for each group's input indices i — turns
 * the hidden layer's input weights back into a per-feature-group "how much this matters" figure. */
function computeGroupMagnitudes(
  w1: number[][],
): { label: string; magnitude: number }[] {
  let offset = 0;
  return FEATURE_GROUPS.map((group) => {
    let total = 0;
    let count = 0;
    for (let i = offset; i < offset + group.size; i++) {
      for (const row of w1) {
        total += Math.abs(row[i]);
        count++;
      }
    }
    offset += group.size;
    return { label: group.label, magnitude: count > 0 ? total / count : 0 };
  });
}

function flattenWeights(model: ListeningModel): number[] {
  return [...model.w1.flat(), ...model.w2];
}

function downloadModel(model: ListeningModel): void {
  const blob = new Blob([JSON.stringify(model, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `listening-model-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return <AdminDashboard />;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

function WeightBarChart({
  groups,
}: {
  groups: { label: string; magnitude: number }[];
}) {
  const max = Math.max(...groups.map((g) => g.magnitude), 0.0001);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div
          key={g.label}
          className="flex items-center gap-3"
          title={`${g.label}: ${g.magnitude.toFixed(3)}`}
        >
          <span className="w-24 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
            {g.label}
          </span>
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-r bg-[#2a78d6] dark:bg-[#3987e5]"
              style={{ width: `${(g.magnitude / max) * 100}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs text-zinc-400 tabular-nums">
            {g.magnitude.toFixed(3)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Same order as FEATURE_GROUPS (src/lib/features.ts) — purely a display concern, so it's
// kept local to this component rather than in the shared feature-extraction module.
const GROUP_COLORS = [
  "#94a3b8", // Bias
  "#22d3ee", // Time of day
  "#a78bfa", // Weekday
  "#34d399", // Artist
  "#fbbf24", // Album
  "#f472b6", // Track
];
const POS_COLOR = "#2a78d6"; // positive weight
const NEG_COLOR = "#e05a5a"; // negative weight
const PULSE_COLOR = "#7dd3fc";

interface Particle {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  duration: number;
}

interface Layout {
  input: { x: number; y: number }[];
  hidden: { x: number; y: number }[];
  output: { x: number; y: number };
}

function computeLayout(width: number, height: number): Layout {
  const marginX = width * 0.08;
  const stepIn = height / (FEATURE_SIZE + 1);
  const stepHid = height / (HIDDEN_SIZE + 1);
  return {
    input: Array.from({ length: FEATURE_SIZE }, (_, i) => ({
      x: marginX,
      y: stepIn * (i + 1),
    })),
    hidden: Array.from({ length: HIDDEN_SIZE }, (_, h) => ({
      x: width / 2,
      y: stepHid * (h + 1),
    })),
    output: { x: width - marginX, y: height / 2 },
  };
}

const inputGroupColors: string[] = FEATURE_GROUPS.flatMap((g, gi) =>
  Array(g.size).fill(GROUP_COLORS[gi % GROUP_COLORS.length]),
);

/** Which feature group a raw input index falls in, and its position within that group. */
function describeInputIndex(index: number): { label: string; localIndex: number } {
  let offset = 0;
  for (const g of FEATURE_GROUPS) {
    if (index < offset + g.size) return { label: g.label, localIndex: index - offset };
    offset += g.size;
  }
  return { label: "Unknown", localIndex: index };
}

/**
 * Renders the model's actual w1/w2 weight matrices as a node graph — no synthetic data.
 * A pulse wave animates through the strongest connections whenever `model.trainingEvents`
 * genuinely increases (a real trainStep() ran, e.g. because a track finished playing).
 */
function NetworkVisualizer({
  model,
  latestEvent,
}: {
  model: ListeningModel;
  latestEvent: ModelEvent | undefined;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<Layout>(computeLayout(600, 560));
  const hoveredRef = useRef<{ kind: "input" | "hidden" | "output"; index: number } | null>(null);
  const modelRef = useRef(model);
  const latestEventRef = useRef(latestEvent);
  const particlesRef = useRef<Particle[]>([]);
  const prevTrainingEventsRef = useRef<number | null>(null);
  const prevTsRef = useRef<number | null>(null);
  const prefersDarkRef = useRef(true);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    latestEventRef.current = latestEvent;
  }, [latestEvent]);

  // Canvas text can't use Tailwind's `dark:` variant, so track the media query directly —
  // keeps the always-on bias labels readable against both the light and dark canvas surface.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    prefersDarkRef.current = mq.matches;
    const handleChange = (e: MediaQueryListEvent) => {
      prefersDarkRef.current = e.matches;
    };
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  // Spawn a pulse wave only in response to a real, new training event — never on a timer.
  useEffect(() => {
    const prev = prevTrainingEventsRef.current;
    prevTrainingEventsRef.current = model.trainingEvents;
    if (prev === null || model.trainingEvents <= prev) return;

    const { input, hidden, output } = layoutRef.current;
    const ranked: [number, number, number][] = [];
    for (let h = 0; h < model.w1.length; h++) {
      for (let i = 0; i < model.w1[h].length; i++) {
        ranked.push([Math.abs(model.w1[h][i]), i, h]);
      }
    }
    ranked.sort((a, b) => b[0] - a[0]);
    const wave1: Particle[] = ranked.slice(0, 40).map(([, i, h]) => ({
      x0: input[i].x,
      y0: input[i].y,
      x1: hidden[h].x,
      y1: hidden[h].y,
      t: 0,
      duration: 500,
    }));
    particlesRef.current.push(...wave1);

    const timer = setTimeout(() => {
      const wave2: Particle[] = hidden.map((h) => ({
        x0: h.x,
        y0: h.y,
        x1: output.x,
        y1: output.y,
        t: 0,
        duration: 400,
      }));
      particlesRef.current.push(...wave2);
    }, 520);
    return () => clearTimeout(timer);
  }, [model]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssH = Math.max(420, Math.min(640, window.innerHeight * 0.62));
      canvas.width = rect.width * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutRef.current = computeLayout(rect.width, cssH);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let rafId: number;
    const frame = (ts: number) => {
      const dt = prevTsRef.current == null ? 16 : ts - prevTsRef.current;
      prevTsRef.current = ts;
      particlesRef.current = particlesRef.current.filter((p) => {
        p.t += dt / p.duration;
        return p.t < 1;
      });

      const { input, hidden, output } = layoutRef.current;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      const m = modelRef.current;
      // w1 and w2 live on very different natural scales (w1 starts randomly around
      // ±0.1, w2 starts at exactly 0 and only grows slowly via real training steps), so
      // each layer is normalized against its own max — otherwise an early w2 barely
      // registers next to w1's much larger init spread and the output side reads as blank.
      const maxAbsW1 = Math.max(...m.w1.flat().map(Math.abs), 1e-4);
      const maxAbsW2 = Math.max(...m.w2.map(Math.abs), 1e-4);

      // Hovering a hidden node dims every edge that isn't attached to it, so its actual
      // wiring (which inputs feed it, what it sends to the output) stands out from the rest.
      const hovered = hoveredRef.current;
      const hoveredHidden = hovered?.kind === "hidden" ? hovered.index : null;

      ctx.lineCap = "round";
      for (let hi = 0; hi < m.w1.length; hi++) {
        const hp = hidden[hi];
        const dim = hoveredHidden !== null && hoveredHidden !== hi;
        for (let i = 0; i < m.w1[hi].length; i++) {
          const wgt = m.w1[hi][i];
          const frac = Math.abs(wgt) / maxAbsW1;
          if (frac < 0.02) continue;
          const ip = input[i];
          ctx.globalAlpha = Math.min(1, frac) * 0.55 * (dim ? 0.1 : 1);
          ctx.strokeStyle = wgt >= 0 ? POS_COLOR : NEG_COLOR;
          ctx.lineWidth = 0.35 + frac * 1.6;
          ctx.beginPath();
          ctx.moveTo(ip.x, ip.y);
          ctx.lineTo(hp.x, hp.y);
          ctx.stroke();
        }
      }
      for (let hi = 0; hi < m.w2.length; hi++) {
        const hp = hidden[hi];
        const wgt = m.w2[hi];
        const frac = Math.abs(wgt) / maxAbsW2;
        const dim = hoveredHidden !== null && hoveredHidden !== hi;
        ctx.globalAlpha = Math.min(1, Math.max(frac, 0.08)) * 0.85 * (dim ? 0.1 : 1);
        ctx.strokeStyle = wgt >= 0 ? POS_COLOR : NEG_COLOR;
        ctx.lineWidth = 0.6 + frac * 3;
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y);
        ctx.lineTo(output.x, output.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const p of particlesRef.current) {
        const ease = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2;
        const x = p.x0 + (p.x1 - p.x0) * ease;
        const y = p.y0 + (p.y1 - p.y0) * ease;
        ctx.save();
        ctx.globalAlpha = Math.sin(p.t * Math.PI);
        ctx.fillStyle = PULSE_COLOR;
        ctx.shadowColor = PULSE_COLOR;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      input.forEach((p, i) => {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = inputGroupColors[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      hidden.forEach((p, hi) => {
        const contribution = Math.abs(m.w2[hi]) / maxAbsW2;
        const r = 6 + contribution * 5;
        ctx.save();
        ctx.shadowColor = "#3987e5";
        ctx.shadowBlur = 4 + contribution * 12;
        ctx.fillStyle = "#0f172a";
        ctx.strokeStyle = "#3987e5";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      const predicted = latestEventRef.current?.predicted ?? 0;
      ctx.save();
      ctx.shadowColor = "#34d399";
      ctx.shadowBlur = 10 + predicted * 26;
      ctx.fillStyle = "#0f172a";
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(output.x, output.y, 13 + predicted * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Always-on value labels — each node's own bias, the one number that genuinely
      // belongs to the node itself rather than to a connection.
      const labelColor = prefersDarkRef.current ? "#cbd5e1" : "#3f3f46";
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = labelColor;
      ctx.globalAlpha = 0.9;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      hidden.forEach((p, hi) => {
        const bias = m.b1[hi];
        ctx.fillText(`${bias >= 0 ? "+" : ""}${bias.toFixed(3)}`, p.x + 16, p.y);
      });
      ctx.textAlign = "center";
      ctx.fillText(
        `${m.b2 >= 0 ? "+" : ""}${m.b2.toFixed(3)}`,
        output.x,
        output.y + 13 + predicted * 6 + 12,
      );
      ctx.textAlign = "left";
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, []);

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { input, hidden, output } = layoutRef.current;
    const m = modelRef.current;

    type HoverTarget = { kind: "input" | "hidden" | "output"; index: number; dist: number; x: number; y: number };
    const closest: { value: HoverTarget | null } = { value: null };
    const consider = (kind: HoverTarget["kind"], index: number, px: number, py: number, hitRadius: number) => {
      const dist = Math.hypot(px - x, py - y);
      if (dist <= hitRadius && (!closest.value || dist < closest.value.dist)) {
        closest.value = { kind, index, dist, x: px, y: py };
      }
    };
    input.forEach((p, i) => consider("input", i, p.x, p.y, 6));
    hidden.forEach((p, h) => consider("hidden", h, p.x, p.y, 11));
    consider("output", 0, output.x, output.y, 17);

    const best = closest.value;
    hoveredRef.current = best ? { kind: best.kind, index: best.index } : null;
    if (!best) {
      tooltip.style.display = "none";
      return;
    }

    let lines: string[];
    if (best.kind === "input") {
      const { label, localIndex } = describeInputIndex(best.index);
      let total = 0;
      for (const row of m.w1) total += Math.abs(row[best.index]);
      const importance = total / m.w1.length;
      lines = [`${label} #${localIndex + 1}`, `avg |weight| → hidden: ${importance.toFixed(3)}`];
    } else if (best.kind === "hidden") {
      lines = [
        `Hidden unit ${best.index + 1}`,
        `bias: ${m.b1[best.index].toFixed(3)}`,
        `weight → output: ${m.w2[best.index].toFixed(3)}`,
      ];
    } else {
      const predicted = latestEventRef.current?.predicted;
      lines = [
        "Output",
        `bias: ${m.b2.toFixed(3)}`,
        ...(predicted !== undefined ? [`last predicted: ${Math.round(predicted * 100)}%`] : []),
      ];
    }
    tooltip.innerHTML = lines
      .map((l, i) => (i === 0 ? `<div class="font-medium">${l}</div>` : `<div>${l}</div>`))
      .join("");

    // Measure before placing, then clamp inside the container — the container clips
    // overflow, so a tooltip simply centered on an edge node would get cut off and
    // become unreadable.
    const container = containerRef.current;
    if (!container) return;
    tooltip.style.display = "block";
    tooltip.style.visibility = "hidden";
    const containerRect = container.getBoundingClientRect();
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const margin = 6;

    let left = best.x - tw / 2;
    left = Math.min(Math.max(left, margin), containerRect.width - tw - margin);

    let top = best.y - th - 10; // prefer above the node
    if (top < margin) top = best.y + 14; // flip below if that would clip at the top
    top = Math.min(top, containerRect.height - th - margin);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = "visible";
  };

  const handlePointerLeave = () => {
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
    hoveredRef.current = null;
  };

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-950"
      >
        <canvas
          ref={canvasRef}
          className="block w-full"
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
        />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute top-0 left-0 z-10 hidden rounded-md border border-zinc-200 bg-white/95 px-2 py-1 text-[11px] whitespace-nowrap text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {FEATURE_GROUPS.map((g, i) => (
            <span key={g.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
              />
              {g.label}
            </span>
          ))}
        </div>
        <span>
          {latestEvent
            ? `Last trained on "${latestEvent.title}" — predicted ${Math.round(latestEvent.predicted * 100)}%, listened ${Math.round(latestEvent.fraction * 100)}%`
            : "No training events yet — play a track to the end to start training."}
        </span>
      </div>
    </div>
  );
}

function sourceLabel(type: "folder" | "playlist" | "library"): string {
  if (type === "playlist") return "Playlist";
  if (type === "library") return "Library";
  return "Folder";
}

function AdminDashboard() {
  const router = useRouter();
  // `model` is the live PlayerContext state (see src/components/PlayerContext.tsx) — the
  // same object trainStep() mutates when a track finishes, anywhere in the app. Reading it
  // from context instead of a one-off loadModel() means every stat and the network
  // visualizer below re-render the instant a real training step happens.
  const { play, model } = usePlayer();
  const [cachedTracks, setCachedTracks] = useState<CachedTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentSources, setRecentSources] = useState<RecentSource[]>([]);
  const [events, setEvents] = useState<ModelEvent[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{
    usage: number;
    quota: number;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      listCachedTracks(),
      listPlaylists(),
      listRecentSources(50),
      listModelEvents(50),
    ]).then(([tracks, pls, recents, evts]) => {
      setCachedTracks(tracks);
      setPlaylists(pls);
      setRecentSources(recents);
      setEvents(evts);
    });

    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      navigator.storage.estimate().then((estimate) => {
        if (estimate.usage !== undefined && estimate.quota !== undefined) {
          setStorageEstimate({ usage: estimate.usage, quota: estimate.quota });
        }
      });
    }
  }, []);

  // Re-fetch the event log whenever a real training step lands, instead of polling.
  const prevTrainingEventsRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevTrainingEventsRef.current;
    prevTrainingEventsRef.current = model.trainingEvents;
    if (prev === null || model.trainingEvents <= prev) return;
    listModelEvents(50).then(setEvents);
  }, [model.trainingEvents]);

  const totalCacheBytes = useMemo(
    () => cachedTracks.reduce((sum, t) => sum + (t.blob?.size ?? 0), 0),
    [cachedTracks],
  );
  const totalPlaylistTracks = useMemo(
    () => playlists.reduce((sum, p) => sum + p.tracks.length, 0),
    [playlists],
  );
  const groupMagnitudes = useMemo(
    () => computeGroupMagnitudes(model.w1),
    [model],
  );
  const flatWeights = useMemo(() => flattenWeights(model), [model]);
  const weightNorm = useMemo(
    () => Math.sqrt(flatWeights.reduce((sum, w) => sum + w * w, 0)),
    [flatWeights],
  );
  const weightMin = flatWeights.length > 0 ? Math.min(...flatWeights) : 0;
  const weightMax = flatWeights.length > 0 ? Math.max(...flatWeights) : 0;
  const latestEvent = events[0];

  const EVENTS_PAGE_SIZE = 10;
  const [eventsPage, setEventsPage] = useState(0);
  // A newly-fetched event log can be shorter than the current page (or empty) — clamp back
  // to a valid page instead of showing a blank table.
  const eventsPageCount = Math.max(1, Math.ceil(events.length / EVENTS_PAGE_SIZE));
  const clampedEventsPage = Math.min(eventsPage, eventsPageCount - 1);
  const pagedEvents = events.slice(
    clampedEventsPage * EVENTS_PAGE_SIZE,
    (clampedEventsPage + 1) * EVENTS_PAGE_SIZE,
  );

  const handlePlaySource = (source: RecentSource) => {
    play(source.tracks, 0, {
      type: source.type,
      id: source.id,
      name: source.name,
    });
    router.push("/");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="truncate text-center text-base font-medium text-zinc-900 sm:text-lg dark:text-zinc-50">
            Analytics
          </h1>
          <button
            onClick={() => downloadModel(model)}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm whitespace-nowrap text-white transition hover:opacity-90 disabled:cursor-default disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Download className="h-4 w-4" />{" "}
            <span className="hidden sm:inline">Export model</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Cached tracks" value={String(cachedTracks.length)} />
          <StatTile label="Cache size" value={formatBytes(totalCacheBytes)} />
          <StatTile
            label="Playlists"
            value={`${playlists.length} (${totalPlaylistTracks} tracks)`}
          />
          <StatTile
            label="Recently played"
            value={String(recentSources.length)}
          />
          <StatTile
            label="Training events"
            value={String(model.trainingEvents)}
          />
          {storageEstimate && (
            <StatTile
              label="Browser storage"
              value={`${formatBytes(storageEstimate.usage)} / ${formatBytes(storageEstimate.quota)}`}
            />
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Recently played
          </h2>
          {recentSources.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing played yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {recentSources.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => handlePlaySource(s)}
                    className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <PlayCircle className="h-4 w-4 shrink-0 text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">
                        {s.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {sourceLabel(s.type)} · {s.tracks.length} track
                        {s.tracks.length === 1 ? "" : "s"} · last{" "}
                        {new Date(s.lastPlayedAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 tabular-nums dark:bg-zinc-800 dark:text-zinc-400">
                      {s.playCount} play{s.playCount === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Model details
          </h2>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Architecture"
              value={`${FEATURE_SIZE} → ${HIDDEN_SIZE} → 1`}
            />
            <StatTile label="Weight norm" value={weightNorm.toFixed(3)} />
            <StatTile label="Min weight" value={weightMin.toFixed(3)} />
            <StatTile label="Max weight" value={weightMax.toFixed(3)} />
          </div>
          <p className="mb-3 text-xs text-zinc-400">
            Average weight magnitude by feature group — last updated{" "}
            {new Date(model.updatedAt).toLocaleString()}
          </p>
          <WeightBarChart groups={groupMagnitudes} />
        </section>

        <section className="mb-8 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Network activity
          </h2>
          <NetworkVisualizer model={model} latestEvent={latestEvent} />
        </section>

        <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Recent training events
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No training events yet — play a few tracks first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-zinc-400">
                    <th className="pb-2 font-medium">Track</th>
                    <th className="pb-2 text-right font-medium">Predicted</th>
                    <th className="pb-2 text-right font-medium">Listened</th>
                    <th className="pb-2 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {pagedEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="max-w-[12rem] truncate py-2 text-zinc-700 dark:text-zinc-300">
                        {e.title}
                      </td>
                      <td className="py-2 text-right text-zinc-500 tabular-nums">
                        {Math.round(e.predicted * 100)}%
                      </td>
                      <td className="py-2 text-right text-zinc-500 tabular-nums">
                        {Math.round(e.fraction * 100)}%
                      </td>
                      <td className="py-2 text-right text-xs text-zinc-400">
                        {new Date(e.at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {eventsPageCount > 1 && (
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                  <button
                    onClick={() => setEventsPage((p) => Math.max(0, p - 1))}
                    disabled={clampedEventsPage === 0}
                    className="flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-30 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span>
                    Page {clampedEventsPage + 1} of {eventsPageCount}
                  </span>
                  <button
                    onClick={() => setEventsPage((p) => Math.min(eventsPageCount - 1, p + 1))}
                    disabled={clampedEventsPage === eventsPageCount - 1}
                    className="flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 transition hover:bg-zinc-50 disabled:cursor-default disabled:opacity-30 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

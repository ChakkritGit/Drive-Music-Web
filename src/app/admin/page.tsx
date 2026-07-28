"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { SignInScreen } from "@/components/SignInScreen";
import { FEATURE_GROUPS, FEATURE_SIZE } from "@/lib/features";
import { HIDDEN_SIZE } from "@/lib/model";
import {
  listCachedTracks,
  listModelEvents,
  listPlaylists,
  listRecentSources,
  loadModel,
} from "@/lib/db";
import type { CachedTrack, ListeningModel, ModelEvent, Playlist, RecentSource } from "@/types";

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
function computeGroupMagnitudes(w1: number[][]): { label: string; magnitude: number }[] {
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
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
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
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading…</div>;
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
      <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function WeightBarChart({ groups }: { groups: { label: string; magnitude: number }[] }) {
  const max = Math.max(...groups.map((g) => g.magnitude), 0.0001);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.label} className="flex items-center gap-3" title={`${g.label}: ${g.magnitude.toFixed(3)}`}>
          <span className="w-24 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{g.label}</span>
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-r bg-[#2a78d6] dark:bg-[#3987e5]"
              style={{ width: `${(g.magnitude / max) * 100}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-xs text-zinc-400 tabular-nums">{g.magnitude.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}

function AdminDashboard() {
  const [cachedTracks, setCachedTracks] = useState<CachedTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recentSources, setRecentSources] = useState<RecentSource[]>([]);
  const [model, setModel] = useState<ListeningModel | null>(null);
  const [events, setEvents] = useState<ModelEvent[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    Promise.all([
      listCachedTracks(),
      listPlaylists(),
      listRecentSources(50),
      loadModel(),
      listModelEvents(50),
    ]).then(([tracks, pls, recents, mdl, evts]) => {
      setCachedTracks(tracks);
      setPlaylists(pls);
      setRecentSources(recents);
      setModel(mdl);
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

  const totalCacheBytes = useMemo(
    () => cachedTracks.reduce((sum, t) => sum + (t.blob?.size ?? 0), 0),
    [cachedTracks],
  );
  const totalPlaylistTracks = useMemo(() => playlists.reduce((sum, p) => sum + p.tracks.length, 0), [playlists]);
  const groupMagnitudes = useMemo(() => (model ? computeGroupMagnitudes(model.w1) : []), [model]);
  const flatWeights = useMemo(() => (model ? flattenWeights(model) : []), [model]);
  const weightNorm = useMemo(
    () => Math.sqrt(flatWeights.reduce((sum, w) => sum + w * w, 0)),
    [flatWeights],
  );
  const weightMin = flatWeights.length > 0 ? Math.min(...flatWeights) : 0;
  const weightMax = flatWeights.length > 0 ? Math.max(...flatWeights) : 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 pb-28">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Admin Dashboard</h1>
        <button
          onClick={() => model && downloadModel(model)}
          disabled={!model}
          className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Download className="h-4 w-4" /> Download model
        </button>
      </div>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Cached tracks" value={String(cachedTracks.length)} />
        <StatTile label="Cache size" value={formatBytes(totalCacheBytes)} />
        <StatTile label="Playlists" value={`${playlists.length} (${totalPlaylistTracks} tracks)`} />
        <StatTile label="Recently played" value={String(recentSources.length)} />
        <StatTile label="Training events" value={String(model?.trainingEvents ?? 0)} />
        {storageEstimate && (
          <StatTile
            label="Browser storage"
            value={`${formatBytes(storageEstimate.usage)} / ${formatBytes(storageEstimate.quota)}`}
          />
        )}
      </section>

      <section className="mb-8 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Model details</h2>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Architecture" value={`${FEATURE_SIZE} → ${HIDDEN_SIZE} → 1`} />
          <StatTile label="Weight norm" value={weightNorm.toFixed(3)} />
          <StatTile label="Min weight" value={weightMin.toFixed(3)} />
          <StatTile label="Max weight" value={weightMax.toFixed(3)} />
        </div>
        <p className="mb-3 text-xs text-zinc-400">
          Average weight magnitude by feature group
          {model && <> — last updated {new Date(model.updatedAt).toLocaleString()}</>}
        </p>
        <WeightBarChart groups={groupMagnitudes} />
      </section>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">Recent training events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-400">No training events yet — play a few tracks first.</p>
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
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="max-w-[12rem] truncate py-2 text-zinc-700 dark:text-zinc-300">{e.title}</td>
                    <td className="py-2 text-right text-zinc-500 tabular-nums">{Math.round(e.predicted * 100)}%</td>
                    <td className="py-2 text-right text-zinc-500 tabular-nums">{Math.round(e.fraction * 100)}%</td>
                    <td className="py-2 text-right text-xs text-zinc-400">{new Date(e.at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { clearAllData } from "@/lib/db";

export function DataSettings() {
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleClearAllData() {
    setClearing(true);
    try {
      await clearAllData();
    } finally {
      // Everything this app keeps (downloaded tracks, playlists, model, in-memory queue,
      // sync device identity, ...) lives in state above the router or in IndexedDB — a full
      // reload is the only way to guarantee nothing stale is still sitting in memory
      // afterward, rather than trying to reset every provider's state by hand.
      window.location.href = "/";
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-red-200 p-5 dark:border-red-900/60">
        <h2 className="text-sm font-medium text-red-600 dark:text-red-400">Danger zone</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Permanently delete everything this app has stored on this device — downloaded
          tracks, playlists, your listening history and recommendation model, and playback
          settings. This doesn&apos;t sign you out of Google.
        </p>
        <button
          onClick={() => setShowConfirmClear(true)}
          className="mt-4 flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-4 w-4" /> Clear all data
        </button>
      </section>
      {showConfirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => !clearing && setShowConfirmClear(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-base font-semibold">Clear all data?</h3>
            </div>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              This permanently deletes downloaded tracks, playlists (including Favorites),
              your listening history and recommendation model, recently played, and playback
              settings from this device. This can&apos;t be undone. You&apos;ll stay signed in.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowConfirmClear(false)}
                disabled={clearing}
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllData}
                disabled={clearing}
                className="rounded-full bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {clearing ? "Clearing…" : "Clear everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

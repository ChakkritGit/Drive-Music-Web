"use client";

import { CloudCheck, Download, Loader2 } from "lucide-react";
import type { DriveFile } from "@/types";
import { usePlayer } from "@/components/PlayerContext";

export function DownloadAllButton({ files }: { files: DriveFile[] }) {
  const { cachedTracks, downloadProgress, downloadAll } = usePlayer();

  if (files.length === 0) return null;

  const remaining = files.filter((f) => !cachedTracks.has(f.id)).length;
  const isRunning = downloadProgress !== null;

  if (remaining === 0) {
    return (
      <p className="mb-4 flex items-center gap-1.5 text-xs text-accent">
        <CloudCheck className="h-3.5 w-3.5" /> All available offline
      </p>
    );
  }

  return (
    <button
      onClick={() => downloadAll(files)}
      disabled={isRunning}
      className="mb-4 flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {isRunning ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Downloading… {downloadProgress.done}/{downloadProgress.total}
        </>
      ) : (
        <>
          <Download className="h-3.5 w-3.5" />
          Download all ({remaining})
        </>
      )}
    </button>
  );
}

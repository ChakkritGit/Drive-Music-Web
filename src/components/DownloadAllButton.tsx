"use client";

import { CloudCheck, Download, Loader2 } from "lucide-react";
import type { DriveFile } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { PILL_OUTLINE } from "@/components/ui";

export function DownloadAllButton({ files }: { files: DriveFile[] }) {
  const { cachedTracks, downloadProgress, downloadAll } = usePlayer();

  if (files.length === 0) return null;

  const remaining = files.filter((f) => !cachedTracks.has(f.id)).length;
  const isRunning = downloadProgress !== null;

  if (remaining === 0) {
    return (
      <p className="mb-4 flex items-center gap-1.5 text-xs text-accent-strong">
        <CloudCheck className="h-3.5 w-3.5" /> All available offline
      </p>
    );
  }

  return (
    <button
      onClick={() => downloadAll(files)}
      disabled={isRunning}
      className={`mb-4 ${PILL_OUTLINE}`}
    >
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Downloading… {downloadProgress.done}/{downloadProgress.total}
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Download all ({remaining})
        </>
      )}
    </button>
  );
}

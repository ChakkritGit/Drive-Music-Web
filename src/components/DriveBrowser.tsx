"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, Folder, Loader2 } from "lucide-react";
import { isFolder, listFolder } from "@/lib/drive";
import type { DriveFile } from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { usePlayer } from "@/components/PlayerContext";

interface Crumb {
  id: string;
  name: string;
}

const ROOT_CRUMB: Crumb = { id: "root", name: "My Drive" };

export function DriveBrowser() {
  const { data: session } = useSession();
  const { cachedTracks } = usePlayer();
  const [stack, setStack] = useState<Crumb[]>([ROOT_CRUMB]);
  const [items, setItems] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const current = stack[stack.length - 1];

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: mark loading before the fetch starts
    setLoading(true);
    setError(null);

    listFolder(session.accessToken, current.id)
      .then((files) => {
        if (!cancelled) setItems(files);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load folder");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, current.id]);

  const audioFiles = items.filter((f) => !isFolder(f));
  const audioIndex = new Map(audioFiles.map((f, i) => [f.id, i]));

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
        {stack.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
            <button
              onClick={() => setStack(stack.slice(0, i + 1))}
              className={i === stack.length - 1 ? "font-medium text-zinc-900 dark:text-zinc-50" : "hover:underline"}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {loading && (
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {error && <p className="py-10 text-sm text-red-500">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="py-10 text-sm text-zinc-400">This folder is empty.</p>
      )}

      {!loading && !error && audioFiles.length > 0 && <DownloadAllButton files={audioFiles} />}

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {items.map((file) =>
          isFolder(file) ? (
            <li key={file.id}>
              <button
                onClick={() => setStack([...stack, { id: file.id, name: file.name }])}
                className="flex w-full items-center gap-3 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <Folder className="h-5 w-5 shrink-0 text-zinc-400" />
                <span className="truncate text-sm text-zinc-800 dark:text-zinc-200">{file.name}</span>
              </button>
            </li>
          ) : (
            <TrackRow
              key={file.id}
              file={file}
              queue={audioFiles}
              index={audioIndex.get(file.id)!}
              cachedTrack={cachedTracks.get(file.id)}
              source={{ type: "folder", id: current.id, name: current.name }}
            />
          ),
        )}
      </ul>
    </div>
  );
}

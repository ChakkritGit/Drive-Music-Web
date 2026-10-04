"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Folder, Loader2 } from "lucide-react";
import { isFolder, listFolder } from "@/lib/drive";
import type { DriveFile } from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { usePlayer } from "@/components/PlayerContext";
import { EmptyState, PAGE, PageHeader } from "@/components/ui";

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
    <div className={PAGE}>
      <PageHeader eyebrow="Google Drive" title={current.name} />
      {stack.length > 1 && (
        <nav aria-label="Folder path" className="-mt-3 mb-6 flex flex-wrap items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
          {stack.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-300 dark:text-zinc-700">/</span>}
              <button
                onClick={() => setStack(stack.slice(0, i + 1))}
                aria-current={i === stack.length - 1 ? "page" : undefined}
                className={i === stack.length - 1 ? "font-medium text-zinc-950 dark:text-zinc-50" : "hover:text-zinc-950 hover:underline dark:hover:text-zinc-50"}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {error && <p className="py-10 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && items.length === 0 && <EmptyState icon={<Folder className="h-6 w-6" />}>This folder is empty.</EmptyState>}

      {!loading && !error && audioFiles.length > 0 && <DownloadAllButton files={audioFiles} />}

      <ul className="flex flex-col">
        {items.map((file, position) =>
          isFolder(file) ? (
            <li key={file.id}>
              <button
                onClick={() => setStack([...stack, { id: file.id, name: file.name }])}
                className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:hover:bg-zinc-900"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  <Folder className="h-5 w-5" />
                </span>
                <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{file.name}</span>
              </button>
            </li>
          ) : (
            <TrackRow
              key={file.id}
              file={file}
              queue={audioFiles}
              index={audioIndex.get(file.id)!}
              cachedTrack={cachedTracks.get(file.id)}
              // The next *track* below this row — folders sort above tracks here, but a
              // stray one between two of them isn't part of the transition.
              nextFile={items.slice(position + 1).find((next) => !isFolder(next))}
              source={{ type: "folder", id: current.id, name: current.name }}
            />
          ),
        )}
      </ul>
    </div>
  );
}

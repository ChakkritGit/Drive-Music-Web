"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Folder, Loader2, Plus } from "lucide-react";
import { isFolder, listFolder, listPickedAudio } from "@/lib/drive";
import { PICK_MODE } from "@/lib/googleConfig";
import { pickAudioFiles } from "@/lib/picker";
import { useToast } from "@/components/ToastContext";
import type { DriveFile } from "@/types";
import { TrackRow } from "@/components/TrackRow";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { usePlayer } from "@/components/PlayerContext";
import { EmptyState, PAGE, PILL_PRIMARY, PageHeader } from "@/components/ui";
import { useAppAccess } from "@/components/AppAccessContext";
import { TrackListSkeleton } from "@/components/LoadingSkeletons";

interface Crumb {
  id: string;
  name: string;
}

const ROOT_CRUMB: Crumb = { id: "root", name: "My Drive" };

export function DriveBrowser() {
  return PICK_MODE ? <PickedMusic /> : <FolderBrowser />;
}

const PICKED_SOURCE = { type: "folder", id: "picked", name: "Google Drive" } as const;

/**
 * `drive.file` mode: the app sees only the songs chosen in Google's picker, so this page lists
 * those and offers the picker to add more (several at a time).
 */
function PickedMusic() {
  const { data: session } = useSession();
  const { isOffline } = useAppAccess();
  const { cachedTracks } = usePlayer();
  const { showToast } = useToast();
  const [items, setItems] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!session?.accessToken || isOffline) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: mark loading before the fetch starts
    setLoading(true);
    setError(null);
    listPickedAudio(session.accessToken)
      .then((files) => {
        if (!cancelled) setItems(files);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load your songs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, isOffline, reload]);

  const add = async () => {
    if (!session?.accessToken) return;
    setPicking(true);
    try {
      const picked = await pickAudioFiles(session.accessToken);
      if (picked.length) {
        showToast(picked.length === 1 ? "Added 1 song" : `Added ${picked.length} songs`);
        setReload((n) => n + 1);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't open Google's file picker");
    } finally {
      setPicking(false);
    }
  };

  if (isOffline) {
    return (
      <div className={PAGE}>
        <PageHeader eyebrow="Google Drive" title="My Drive" />
        <EmptyState action={<Link href="/library" className={PILL_PRIMARY}>Open downloaded music</Link>}>
          Connect to the internet to add songs from Google Drive. Downloaded tracks are available in your offline library.
        </EmptyState>
      </div>
    );
  }

  const addButton = (
    <button type="button" onClick={add} disabled={picking || !session?.accessToken} className={PILL_PRIMARY}>
      {picking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add songs from Drive
    </button>
  );

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Google Drive"
        title="My Drive"
        meta={items.length ? `${items.length} song${items.length === 1 ? "" : "s"} · only the songs you add are visible to Drive Music` : undefined}
        actions={items.length ? addButton : undefined}
      />

      {loading && <TrackListSkeleton />}

      {error && <p className="py-10 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <EmptyState icon={<Folder className="h-6 w-6" />} action={addButton}>
          Choose the songs Drive Music may play. In Google&apos;s picker, tap several songs, then Select. Drive Music never sees anything else in your Drive.
        </EmptyState>
      )}

      {!loading && !error && items.length > 0 && <DownloadAllButton files={items} />}

      {!loading && !error && <ul className="stagger flex flex-col">
        {items.map((file, i) => (
          <TrackRow
            key={file.id}
            file={file}
            queue={items}
            index={i}
            cachedTrack={cachedTracks.get(file.id)}
            nextFile={items[i + 1]}
            source={PICKED_SOURCE}
          />
        ))}
      </ul>}
    </div>
  );
}

function FolderBrowser() {
  const { data: session } = useSession();
  const { isOffline } = useAppAccess();
  const { cachedTracks } = usePlayer();
  const [stack, setStack] = useState<Crumb[]>([ROOT_CRUMB]);
  const [items, setItems] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const current = stack[stack.length - 1];

  useEffect(() => {
    if (!session?.accessToken || isOffline) return;
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
  }, [session?.accessToken, current.id, isOffline]);

  const audioFiles = items.filter((f) => !isFolder(f));
  const audioIndex = new Map(audioFiles.map((f, i) => [f.id, i]));

  if (isOffline) {
    return (
      <div className={PAGE}>
        <PageHeader eyebrow="Google Drive" title="My Drive" />
        <EmptyState action={<Link href="/library" className={PILL_PRIMARY}>Open downloaded music</Link>}>
          Connect to the internet to browse Google Drive. Downloaded tracks are available in your offline library.
        </EmptyState>
      </div>
    );
  }

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

      {loading && <TrackListSkeleton folders />}

      {error && <p className="py-10 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loading && !error && items.length === 0 && <EmptyState icon={<Folder className="h-6 w-6" />}>This folder is empty.</EmptyState>}

      {!loading && !error && audioFiles.length > 0 && <DownloadAllButton files={audioFiles} />}

      {!loading && !error && <ul className="stagger flex flex-col">
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
      </ul>}
    </div>
  );
}

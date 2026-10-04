"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Library, Shuffle } from "lucide-react";
import Link from "next/link";
import { EmptyState, PAGE, PILL_PRIMARY, PageHeader, SearchField } from "@/components/ui";
import type { PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { SequenceMixButton } from "@/components/SequenceMixButton";
import { extractFeatures } from "@/lib/features";
import { predict, weightedRandomIndex } from "@/lib/model";

const LIBRARY_SOURCE: PlaySource = { type: "library", id: "__library__", name: "Your Library" };

export function LibraryView() {
  const { cachedTracks, removeFromCache, shuffle, toggleShuffle, play, model } = usePlayer();
  const tracks = Array.from(cachedTracks.values()).sort((a, b) => b.cachedAt - a.cachedAt);
  // The queue passed to each row stays the full, unfiltered list — searching only changes
  // what's displayed, not what plays next/prev, so up-next isn't scoped to the search text.
  const queue = tracks.map((t) => t.driveMeta);
  // The search is the URL's `q`, shared with the desktop top bar's search box.
  const pathname = usePathname();
  const query = useSearchParams().get("q") ?? "";
  // replaceState is synced into useSearchParams immediately, so typing never lags (see TopBar).
  const setQuery = (next: string) =>
    window.history.replaceState(null, "", next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTracks = tracks
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => {
      if (!normalizedQuery) return true;
      const haystack = [t.driveMeta.name, t.parsedMeta?.title, t.parsedMeta?.artist, t.parsedMeta?.album]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

  function handleShufflePlay() {
    if (queue.length === 0) return;
    if (!shuffle) toggleShuffle();
    const now = new Date();
    const weights = queue.map((f) => predict(model, extractFeatures(f, cachedTracks.get(f.id)?.parsedMeta, now)));
    play(queue, weightedRandomIndex(weights), LIBRARY_SOURCE);
  }

  return (
    <div className={PAGE}>
      <PageHeader
        eyebrow="Offline"
        title="Library"
        meta={`${tracks.length} downloaded track${tracks.length === 1 ? "" : "s"} · plays without a connection`}
        actions={
          tracks.length > 0 && (
            <>
              <button onClick={handleShufflePlay} className={PILL_PRIMARY}>
                <Shuffle className="h-4 w-4" /> Shuffle play
              </button>
              <SequenceMixButton files={queue} source={LIBRARY_SOURCE} />
            </>
          )
        }
      />

      {/* On a desktop the top bar's search box is this search; phones get their own here. */}
      {tracks.length > 0 && (
        <SearchField value={query} onChange={setQuery} placeholder="Search downloaded tracks" className="mb-4 lg:hidden" />
      )}

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Library className="h-6 w-6" />}
          action={
            <Link href="/browse" className={PILL_PRIMARY}>
              Browse your Drive
            </Link>
          }
        >
          Nothing downloaded yet. Play a track from Browse and it shows up here for offline listening.
        </EmptyState>
      ) : visibleTracks.length === 0 ? (
        <EmptyState>No downloaded tracks match &quot;{query}&quot;.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {visibleTracks.map(({ t, index }, position) => (
            <TrackRow
              key={t.fileId}
              file={t.driveMeta}
              cachedTrack={t}
              queue={queue}
              index={index}
              // The *list's* next row, not the queue's — sorting and search make those two
              // different things, and the chip belongs to the seam the user can see.
              nextFile={visibleTracks[position + 1]?.t.driveMeta}
              source={LIBRARY_SOURCE}
              onRemove={() => removeFromCache(t.fileId)}
              removeLabel="Remove download"
            />
          ))}
        </ul>
      )}
    </div>
  );
}

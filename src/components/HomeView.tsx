"use client";

import { useState } from "react";
import { Clock, Heart, Sparkles } from "lucide-react";
import type { CachedTrack, DriveFile, PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists, FAVORITES_PLAYLIST_NAME } from "@/components/PlaylistsContext";
import { PlaylistCard } from "@/components/PlaylistCard";
import { CollectionDetail } from "@/components/CollectionDetail";
import { extractFeatures } from "@/lib/features";
import { predict } from "@/lib/model";

const TRAINED_THRESHOLD = 5;

interface OpenCollection {
  title: string;
  subtitle?: string;
  tracks: DriveFile[];
  source?: PlaySource;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function coversFor(tracks: DriveFile[], cachedTracks: Map<string, CachedTrack>): string[] {
  const covers: string[] = [];
  for (const t of tracks) {
    const pic = cachedTracks.get(t.id)?.parsedMeta.pictureDataUrl;
    if (pic) covers.push(pic);
    if (covers.length >= 4) break;
  }
  return covers;
}

function sourceLabel(type: "folder" | "playlist" | "library"): string {
  if (type === "playlist") return "Playlist";
  if (type === "library") return "Library";
  return "Folder";
}

export function HomeView() {
  const { cachedTracks, recentSources, model } = usePlayer();
  const { playlists } = usePlaylists();
  const [openCollection, setOpenCollection] = useState<OpenCollection | null>(null);

  const allCached = Array.from(cachedTracks.values()).sort((a, b) => b.cachedAt - a.cachedAt);
  const recentlyAdded = allCached.slice(0, 20).map((t) => t.driveMeta);
  const shuffleAllQueue = allCached.map((t) => t.driveMeta);
  // Favorites is just an ordinary playlist under the hood — surface it first in this row.
  const orderedPlaylists = [...playlists].sort((a, b) =>
    a.name === FAVORITES_PLAYLIST_NAME ? -1 : b.name === FAVORITES_PLAYLIST_NAME ? 1 : 0,
  );
  const hasAnything = recentSources.length > 0 || playlists.length > 0 || allCached.length > 0;

  const now = new Date();
  const madeForYou = allCached
    .map((t) => ({ file: t.driveMeta, score: predict(model, extractFeatures(t.driveMeta, t.parsedMeta, now)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((s) => s.file);

  if (openCollection) {
    return (
      <CollectionDetail
        title={openCollection.title}
        subtitle={openCollection.subtitle}
        tracks={openCollection.tracks}
        source={openCollection.source}
        onBack={() => setOpenCollection(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{getGreeting()}</h1>

      {!hasAnything && (
        <p className="py-10 text-sm text-zinc-400">
          Nothing to show yet — head to Browse to play something from your Drive.
        </p>
      )}

      {recentSources.length > 0 && (
        <Section title="Recently played" icon={<Clock className="h-4 w-4" />}>
          {recentSources.map((s) => (
            <PlaylistCard
              key={s.id}
              title={s.name}
              subtitle={sourceLabel(s.type)}
              covers={coversFor(s.tracks, cachedTracks)}
              onPlay={() =>
                setOpenCollection({
                  title: s.name,
                  subtitle: sourceLabel(s.type),
                  tracks: s.tracks,
                  source: { type: s.type, id: s.id, name: s.name },
                })
              }
            />
          ))}
        </Section>
      )}

      {orderedPlaylists.length > 0 && (
        <Section title="Your playlists">
          {orderedPlaylists.map((p) => (
            <PlaylistCard
              key={p.id}
              title={p.name}
              subtitle={`${p.tracks.length} track${p.tracks.length === 1 ? "" : "s"}`}
              covers={coversFor(p.tracks, cachedTracks)}
              icon={p.name === FAVORITES_PLAYLIST_NAME ? <Heart className="h-8 w-8" /> : undefined}
              onPlay={() =>
                setOpenCollection({
                  title: p.name,
                  subtitle: "Playlist",
                  tracks: p.tracks,
                  source: { type: "playlist", id: p.id, name: p.name },
                })
              }
            />
          ))}
        </Section>
      )}

      {allCached.length > 0 && (
        <Section title="Recommended for you" icon={<Sparkles className="h-4 w-4" />}>
          <PlaylistCard
            title="Shuffle All"
            subtitle={`${allCached.length} downloaded track${allCached.length === 1 ? "" : "s"}`}
            covers={coversFor(shuffleAllQueue, cachedTracks)}
            onPlay={() =>
              setOpenCollection({ title: "Shuffle All", subtitle: "All downloaded tracks", tracks: shuffleAllQueue })
            }
          />
          <PlaylistCard
            title="Recently Added"
            subtitle="From your downloads"
            covers={coversFor(recentlyAdded, cachedTracks)}
            onPlay={() =>
              setOpenCollection({ title: "Recently Added", subtitle: "From your downloads", tracks: recentlyAdded })
            }
          />
          <PlaylistCard
            title="Made For You"
            subtitle={model.trainingEvents < TRAINED_THRESHOLD ? "Learning your taste…" : "Based on your listening"}
            covers={coversFor(madeForYou, cachedTracks)}
            onPlay={() =>
              setOpenCollection({
                title: "Made For You",
                subtitle: model.trainingEvents < TRAINED_THRESHOLD ? "Learning your taste…" : "Based on your listening",
                tracks: madeForYou,
              })
            }
          />
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {icon}
        {title}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">{children}</div>
    </section>
  );
}

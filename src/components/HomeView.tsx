"use client";

import { useState } from "react";
import { FolderOpen, Heart, Music, Pause, Play } from "lucide-react";
import Link from "next/link";
import type { CachedTrack, DriveFile, PlaySource } from "@/types";
import { usePlayer } from "@/components/PlayerContext";
import { usePlaylists, FAVORITES_PLAYLIST_NAME } from "@/components/PlaylistsContext";
import { MediaCard } from "@/components/MediaCard";
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
  const { cachedTracks, recentSources, model, currentFile, currentMeta, isPlaying, togglePlay, expand, play, currentSource } =
    usePlayer();
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

  const lastSource = recentSources[0];
  const playCollection = (tracks: DriveFile[], source?: PlaySource) => {
    if (tracks.length > 0) play(tracks, 0, source);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{getGreeting()}</p>

      {/* The hero: what is playing, or failing that, the last thing played. */}
      {currentFile ? (
        <Hero
          label={isPlaying ? "Now playing" : "Paused"}
          title={currentMeta?.title || currentFile.name}
          meta={[currentMeta?.artist, currentSource?.name].filter(Boolean).join(" · ")}
          cover={currentMeta?.pictureDataUrl}
          primary={{ label: isPlaying ? "Pause" : "Resume", icon: isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />, onClick: () => togglePlay() }}
          secondary={{ label: "Open player", onClick: expand }}
        />
      ) : lastSource ? (
        <Hero
          label="Jump back in"
          title={lastSource.name}
          meta={`${sourceLabel(lastSource.type)} · ${lastSource.tracks.length} track${lastSource.tracks.length === 1 ? "" : "s"}`}
          cover={coversFor(lastSource.tracks, cachedTracks)[0]}
          primary={{
            label: "Play",
            icon: <Play className="h-4 w-4 fill-current" />,
            onClick: () => playCollection(lastSource.tracks, { type: lastSource.type, id: lastSource.id, name: lastSource.name }),
          }}
          secondary={{
            label: "Open",
            onClick: () =>
              setOpenCollection({
                title: lastSource.name,
                subtitle: sourceLabel(lastSource.type),
                tracks: lastSource.tracks,
                source: { type: lastSource.type, id: lastSource.id, name: lastSource.name },
              }),
          }}
        />
      ) : (
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Drive Music</h1>
      )}

      {!hasAnything && (
        <div className="mt-16 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
            <Music className="h-6 w-6" />
          </span>
          <p className="mt-4 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            Nothing here yet. Pick a folder from your Drive and start listening.
          </p>
          <Link
            href="/browse"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-accent/85 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:outline-none"
          >
            <FolderOpen className="h-4 w-4" /> Browse your Drive
          </Link>
        </div>
      )}

      {recentSources.length > 0 && (
        <Section title="Recently played">
          {recentSources.map((s) => {
            const source: PlaySource = { type: s.type, id: s.id, name: s.name };
            return (
              <MediaCard
                key={s.id}
                title={s.name}
                subtitle={sourceLabel(s.type)}
                covers={coversFor(s.tracks, cachedTracks)}
                onOpen={() => setOpenCollection({ title: s.name, subtitle: sourceLabel(s.type), tracks: s.tracks, source })}
                onPlay={() => playCollection(s.tracks, source)}
              />
            );
          })}
        </Section>
      )}

      {orderedPlaylists.length > 0 && (
        <Section title="Your playlists" href="/playlists">
          {orderedPlaylists.map((p) => {
            const source: PlaySource = { type: "playlist", id: p.id, name: p.name };
            return (
              <MediaCard
                key={p.id}
                title={p.name}
                subtitle={`${p.tracks.length} track${p.tracks.length === 1 ? "" : "s"}`}
                covers={coversFor(p.tracks, cachedTracks)}
                icon={p.name === FAVORITES_PLAYLIST_NAME ? <Heart className="h-8 w-8" /> : undefined}
                onOpen={() => setOpenCollection({ title: p.name, subtitle: "Playlist", tracks: p.tracks, source })}
                onPlay={() => playCollection(p.tracks, source)}
              />
            );
          })}
        </Section>
      )}

      {allCached.length > 0 && (
        <Section title="Made for you" href="/library">
          <MediaCard
            title="Shuffle All"
            subtitle={`${allCached.length} downloaded track${allCached.length === 1 ? "" : "s"}`}
            covers={coversFor(shuffleAllQueue, cachedTracks)}
            onOpen={() => setOpenCollection({ title: "Shuffle All", subtitle: "All downloaded tracks", tracks: shuffleAllQueue })}
            onPlay={() => playCollection(shuffleAllQueue)}
          />
          <MediaCard
            title="Recently Added"
            subtitle="From your downloads"
            covers={coversFor(recentlyAdded, cachedTracks)}
            onOpen={() => setOpenCollection({ title: "Recently Added", subtitle: "From your downloads", tracks: recentlyAdded })}
            onPlay={() => playCollection(recentlyAdded)}
          />
          <MediaCard
            title="Made For You"
            subtitle={model.trainingEvents < TRAINED_THRESHOLD ? "Learning your taste…" : "Based on your listening"}
            covers={coversFor(madeForYou, cachedTracks)}
            onOpen={() =>
              setOpenCollection({
                title: "Made For You",
                subtitle: model.trainingEvents < TRAINED_THRESHOLD ? "Learning your taste…" : "Based on your listening",
                tracks: madeForYou,
              })
            }
            onPlay={() => playCollection(madeForYou)}
          />
        </Section>
      )}
    </div>
  );
}

function Hero({
  label,
  title,
  meta,
  cover,
  primary,
  secondary,
}: {
  label: string;
  title: string;
  meta: string;
  cover?: string;
  primary: { label: string; icon: React.ReactNode; onClick: () => void };
  secondary: { label: string; onClick: () => void };
}) {
  return (
    <section className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end">
      <div className="aspect-square w-40 shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-md sm:w-48 lg:w-56 dark:bg-zinc-900">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">
            <Music className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wider text-accent-strong uppercase">{label}</p>
        <h1 className="mt-2 line-clamp-2 text-3xl font-bold tracking-tight text-zinc-950 lg:text-4xl dark:text-zinc-50">{title}</h1>
        {meta && <p className="mt-2 truncate text-sm text-zinc-500 dark:text-zinc-400">{meta}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={primary.onClick}
            className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-accent/85 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {primary.icon}
            {primary.label}
          </button>
          <button
            onClick={secondary.onClick}
            className="inline-flex h-10 items-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {secondary.label}
          </button>
        </div>
      </div>
    </section>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-semibold tracking-wider text-zinc-500 uppercase hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
            See all
          </Link>
        )}
      </div>
      <div className="stagger grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
    </section>
  );
}

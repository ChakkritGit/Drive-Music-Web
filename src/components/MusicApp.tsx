"use client";

import { useState } from "react";
import type { Session } from "next-auth";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { FolderOpen, Gauge, Home as HomeIcon, Library as LibraryIcon, ListMusic, LogOut } from "lucide-react";
import clsx from "clsx";
import { usePlaylists } from "@/components/PlaylistsContext";
import { HomeView } from "@/components/HomeView";
import { DriveBrowser } from "@/components/DriveBrowser";
import { LibraryView } from "@/components/LibraryView";
import { PlaylistsView } from "@/components/PlaylistsView";
import { PlaylistDetail } from "@/components/PlaylistDetail";

type View = "home" | "browse" | "playlists" | "library";

// PlayerProvider/PlaylistsProvider and the persistent Player/FullPlayer are mounted globally
// in Providers.tsx (above the router), so playback survives navigating to /admin and back.
export function MusicApp({ session }: { session: Session }) {
  const [view, setView] = useState<View>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const { playlists } = usePlaylists();
  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) ?? null;

  return (
    <div className="flex flex-1 flex-col">
      {session.error === "RefreshAccessTokenError" && (
        <div className="bg-amber-50 px-6 py-2 text-center text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Your Google session expired.{" "}
          <button onClick={() => signIn("google")} className="underline">
            Sign in again
          </button>
          .
        </div>
      )}

      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <TabButton
            active={view === "home"}
            onClick={() => setView("home")}
            icon={<HomeIcon className="h-4 w-4" />}
            label="Home"
          />
          <TabButton
            active={view === "browse"}
            onClick={() => setView("browse")}
            icon={<FolderOpen className="h-4 w-4" />}
            label="Browse"
          />
          <TabButton
            active={view === "playlists"}
            onClick={() => setView("playlists")}
            icon={<ListMusic className="h-4 w-4" />}
            label="Playlists"
          />
          <TabButton
            active={view === "library"}
            onClick={() => setView("library")}
            icon={<LibraryIcon className="h-4 w-4" />}
            label="Library"
          />
        </div>
        <div className="flex items-center gap-3">
          {session.user?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="h-7 w-7 rounded-full" />
          )}
          <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">{session.user?.name}</span>
          <Link
            href="/admin"
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
            aria-label="Admin dashboard"
          >
            <Gauge className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-28">
        {view === "home" && <HomeView />}
        {view === "browse" && <DriveBrowser />}
        {view === "playlists" &&
          (selectedPlaylist ? (
            <PlaylistDetail playlist={selectedPlaylist} onBack={() => setSelectedPlaylistId(null)} />
          ) : (
            <PlaylistsView onOpen={(p) => setSelectedPlaylistId(p.id)} />
          ))}
        {view === "library" && <LibraryView />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

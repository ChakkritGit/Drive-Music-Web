"use client";

import { canViewAnalytics } from "@/lib/admin";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Gauge, Heart, ListMusic, LogOut, Plus, Settings } from "lucide-react";
import clsx from "clsx";
import { AppLogo } from "@/components/AppLogo";
import { NAV_ITEMS } from "@/components/nav";
import { FAVORITES_PLAYLIST_NAME, usePlaylists } from "@/components/PlaylistsContext";

/** The desktop navigation: where to go, the user's playlists, and the account. Hidden under `lg`. */
export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { playlists } = usePlaylists();
  const favorites = playlists.find((p) => p.name === FAVORITES_PLAYLIST_NAME);
  const others = playlists.filter((p) => p !== favorites);
  const [home, browse, playlistsItem, library] = NAV_ITEMS;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-zinc-200 bg-zinc-50 px-3 py-5 lg:flex dark:border-zinc-800 dark:bg-zinc-950">
      <Link href="/" className="flex items-center gap-2.5 rounded-lg px-3 py-1">
        <AppLogo size={28} />
        <span className="text-[15px] font-semibold text-zinc-950 dark:text-zinc-50">Drive Music</span>
      </Link>

      <Label>Discover</Label>
      <NavItem href={home.href} icon={home.icon} label={home.label} active={home.match(pathname)} />
      <NavItem href={browse.href} icon={browse.icon} label={browse.label} active={browse.match(pathname)} />

      <Label>Library</Label>
      <NavItem href={library.href} icon={library.icon} label={library.label} active={library.match(pathname)} />
      {favorites && (
        <NavItem
          href={`/playlists/${favorites.id}`}
          icon={<Heart className="h-[18px] w-[18px]" />}
          label="Favorites"
          active={pathname === `/playlists/${favorites.id}`}
        />
      )}
      <NavItem
        href={playlistsItem.href}
        icon={playlistsItem.icon}
        label={playlistsItem.label}
        // Exact: a single playlist lights up its own row below instead.
        active={pathname === "/playlists"}
      />

      <Label>Playlists</Label>
      {/* Creating one lives on /playlists, where the name field is. */}
      <NavItem href="/playlists" icon={<Plus className="h-[18px] w-[18px]" />} label="New playlist" active={false} />
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {others.map((p) => (
          <NavItem
            key={p.id}
            href={`/playlists/${p.id}`}
            icon={<ListMusic className="h-[18px] w-[18px]" />}
            label={p.name}
            active={pathname === `/playlists/${p.id}`}
          />
        ))}
      </div>

      <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <NavItem href="/settings" icon={<Settings className="h-[18px] w-[18px]" />} label="Settings" active={pathname.startsWith("/settings")} />
        {canViewAnalytics(session?.user?.email) && <NavItem href="/admin" icon={<Gauge className="h-[18px] w-[18px]" />} label="Analytics" active={pathname.startsWith("/admin")} />}
        <div className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="h-7 w-7 shrink-0 rounded-full" />
          ) : (
            <span className="h-7 w-7 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">{session?.user?.name}</span>
          <button
            onClick={() => signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{children}</p>;
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
        active
          ? "bg-white font-medium text-zinc-950 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
      )}
    >
      <span className={clsx("shrink-0", active && "text-accent-strong")}>{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

"use client";

import { useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  Gauge,
  Home as HomeIcon,
  Library as LibraryIcon,
  ListMusic,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import { SignInScreen } from "@/components/SignInScreen";

const NAV_ITEMS: {
  href: string;
  match: (pathname: string) => boolean;
  icon: React.ReactNode;
  label: string;
}[] = [
  {
    href: "/",
    match: (p) => p === "/",
    icon: <HomeIcon className="h-4 w-4" />,
    label: "Home",
  },
  {
    href: "/browse",
    match: (p) => p.startsWith("/browse"),
    icon: <FolderOpen className="h-4 w-4" />,
    label: "Browse",
  },
  {
    href: "/playlists",
    match: (p) => p.startsWith("/playlists"),
    icon: <ListMusic className="h-4 w-4" />,
    label: "Playlists",
  },
  {
    href: "/library",
    match: (p) => p.startsWith("/library"),
    icon: <LibraryIcon className="h-4 w-4" />,
    label: "Library",
  },
];

// PlayerProvider/PlaylistsProvider and the persistent Player/FullPlayer are mounted globally
// in Providers.tsx (above the router), so playback survives navigating to /admin and back.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollTopRef = useRef(0);

  function handleMainScroll(e: React.UIEvent<HTMLElement>) {
    const top = e.currentTarget.scrollTop;
    const delta = top - lastScrollTopRef.current;
    // Ignore tiny jitter (bounce scrolling, etc.) — only react once the scroll has moved a
    // few pixels in one direction. Always show the header again near the very top.
    if (top < 8) {
      setHeaderVisible(true);
    } else if (delta > 8) {
      setHeaderVisible(false);
    } else if (delta < -8) {
      setHeaderVisible(true);
    }
    lastScrollTopRef.current = top;
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {session.error === "RefreshAccessTokenError" && (
        <div className="bg-amber-50 px-6 py-2 text-center text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Your Google session expired.{" "}
          <button onClick={() => signIn("google")} className="underline">
            Sign in again
          </button>
          .
        </div>
      )}

      <header
        className={clsx(
          "flex items-center justify-between border-b border-zinc-200 px-4 py-4 transition-transform duration-300 ease-out sm:px-6 dark:border-zinc-800",
          headerVisible ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-zinc-900 sm:hidden dark:text-zinc-50">
            Drive Music
          </span>
          <div className="hidden items-center gap-2 sm:flex">
            {NAV_ITEMS.map((item) => (
              <TabLink
                key={item.href}
                href={item.href}
                active={item.match(pathname)}
                icon={item.icon}
                label={item.label}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session.user?.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-7 w-7 rounded-full"
            />
          )}
          <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
            {session.user?.name}
          </span>
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

      <main
        onScroll={handleMainScroll}
        className="min-h-0 flex-1 overflow-y-auto pb-[calc(11rem+env(safe-area-inset-bottom))] sm:pb-28"
      >
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur sm:hidden dark:border-zinc-800 dark:bg-black/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-16 items-center justify-around">
          {NAV_ITEMS.map((item) => (
            <BottomNavLink
              key={item.href}
              href={item.href}
              active={item.match(pathname)}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

function TabLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function BottomNavLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] transition",
        active
          ? "text-zinc-900 dark:text-zinc-50"
          : "text-zinc-400 dark:text-zinc-500",
      )}
      aria-label={label}
    >
      {icon}
      {label}
    </Link>
  );
}

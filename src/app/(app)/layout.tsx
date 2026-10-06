"use client";

import { Suspense, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, LogOut, User } from "lucide-react";
import clsx from "clsx";
import { SignInScreen } from "@/components/SignInScreen";
import { AppLogo } from "@/components/AppLogo";
import { PolicyLinks } from "@/components/PolicyLinks";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { NAV_ITEMS } from "@/components/nav";

// PlayerProvider/PlaylistsProvider and the persistent Player/FullPlayer are mounted globally
// in Providers.tsx (above the router), so playback survives navigating to /admin and back.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const [profileOpen, setProfileOpen] = useState(false);
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

  // While the session is resolving (including the initial server-rendered HTML, which always
  // starts "loading" since useSession() fetches client-side), this still needs to carry the
  // app's name and purpose — a bare "Loading…" is what a crawler (or anyone who never waits
  // past the first paint) would see instead of a real page. But it's shown to *every* visitor
  // on *every* load, including already-signed-in ones — so unlike the signed-out case, it
  // can't look like a "Sign in with Google" prompt, or it'd flash a misleading CTA at people
  // who are already signed in.
  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <AppLogo size={56} />
        <div>
          <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Drive Music</h1>
          <p className="mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
            A personal audio player for the music files in your Google Drive.
          </p>
        </div>
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
          role="status"
          aria-label="Loading"
        />
        {/* This block *is* the server-rendered homepage — useSession() only resolves client-
            side, so anything that reads the HTML without running JS (Google's OAuth branding
            review among them) sees this and never the sign-in screen below. Google requires
            the homepage to link its privacy policy and terms, so they have to live here too,
            not only on the signed-out screen. */}
        <PolicyLinks />
      </div>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Sidebar />
      <div className="app-content flex min-h-0 flex-1 flex-col transition-[padding] duration-200 lg:pl-60">
        {session.error === "RefreshAccessTokenError" && (
          <div className="bg-amber-50 px-6 py-2 text-center text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Your Google session expired.{" "}
            <button onClick={() => signIn("google")} className="underline">
              Sign in again
            </button>
            .
          </div>
        )}

        {/* Phones only: on a desktop the sidebar carries the name, settings and account. */}
        <header
          className={clsx(
            "relative z-40 flex items-center justify-between border-b border-zinc-200 px-4 py-3 transition-transform duration-300 ease-out lg:hidden dark:border-zinc-800",
            headerVisible ? "translate-y-0" : "-translate-y-full",
          )}
        >
          <Link href="/" className="flex items-center gap-2">
            <AppLogo size={24} />
            <span className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Drive Music</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              className="grid h-10 w-10 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              aria-label="Settings"
            >
              <Settings className="h-[18px] w-[18px]" />
            </Link>
            <div className="relative">
              <button onClick={() => setProfileOpen(v => !v)} aria-label="Profile" aria-expanded={profileOpen} className="grid h-10 w-10 place-items-center rounded-full">
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="" className="h-7 w-7 rounded-full" />
                ) : <User className="h-5 w-5" />}
              </button>
              {profileOpen && <>
                <button className="fixed inset-0 z-40" aria-label="Close profile" onClick={() => setProfileOpen(false)} />
                <div className="absolute top-full right-0 z-50 w-64 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="truncate text-sm font-medium">{session.user?.name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{session.user?.email}</p>
                  <button onClick={() => signOut()} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </>}
            </div>
          </div>
        </header>

        {/* Reads the search from the URL, so it needs its own Suspense boundary to keep the rest
            of the page prerendered. */}
        <Suspense fallback={<div className="hidden h-[4.5rem] shrink-0 lg:block" />}>
          <TopBar />
        </Suspense>

        <main
          onScroll={handleMainScroll}
          className="min-h-0 flex-1 overflow-y-auto pb-[calc(12rem+env(safe-area-inset-bottom))] lg:pb-32"
        >
          {/* Keyed by the path, so each page change plays the entrance. */}
          <div key={pathname} className="page-in">
            {children}
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
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
      aria-current={active ? "page" : undefined}
      className={clsx(
        "relative flex h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium transition",
        active ? "text-accent-strong" : "text-zinc-500 dark:text-zinc-400",
      )}
      aria-label={label}
    >
      {/* The active tab's marker: a short accent bar on the top edge. */}
      <span
        aria-hidden="true"
        className={clsx("absolute top-0 h-1 w-6 rounded-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")}
      />
      {icon}
      {label}
    </Link>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import clsx from "clsx";

/**
 * The desktop bar over the content: Music or Offline, and a search over the downloaded library.
 * (Settings, analytics and devices live in the sidebar and the player bar.) The search lives in the URL (`/library?q=`), so this box and the one on the
 * Library page are the same search.
 */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const onLibrary = pathname.startsWith("/library");
  // Away from Library the box holds its own text until Enter takes it there.
  const [draft, setDraft] = useState("");
  const value = onLibrary ? (params.get("q") ?? "") : draft;

  function change(next: string) {
    // history.replaceState, not router.replace: Next syncs it into useSearchParams at once, so the
    // box never lags behind the keys (a router navigation per keystroke dropped letters).
    if (onLibrary) window.history.replaceState(null, "", next ? `/library?q=${encodeURIComponent(next)}` : "/library");
    else setDraft(next);
  }

  return (
    <div className="hidden h-[4.5rem] shrink-0 items-center gap-4 px-6 lg:flex xl:px-10">
      <nav aria-label="Music or offline" className="flex shrink-0 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
        <Tab href="/" active={!onLibrary}>
          Music
        </Tab>
        <Tab href="/library" active={onLibrary}>
          Offline
        </Tab>
      </nav>

      <form
        role="search"
        className="relative min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!onLibrary) router.push(value.trim() ? `/library?q=${encodeURIComponent(value.trim())}` : "/library");
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={value}
          onChange={(e) => change(e.target.value)}
          placeholder="Search your library"
          aria-label="Search your library"
          className="h-10 w-full max-w-2xl rounded-lg border border-zinc-200 bg-transparent pr-4 pl-10 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus-visible:ring-2 focus-visible:ring-accent/40 dark:border-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-600"
        />
      </form>

    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "grid h-8 place-items-center rounded-md px-4 text-xs font-semibold tracking-wider uppercase transition focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
        active
          ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
          : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50",
      )}
    >
      {children}
    </Link>
  );
}

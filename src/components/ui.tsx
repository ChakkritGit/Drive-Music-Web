"use client";

import type { ReactNode } from "react";
import { Music, Search } from "lucide-react";

/** Every page's outer box, so the content lines up under the top bar at every width. */
export const PAGE = "mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8";

/** The main action of a page: an accent pill with dark text (white on this orange fails contrast). */
export const PILL_PRIMARY =
  "inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-accent/85 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-40";

/** A secondary action next to it. */
export const PILL_OUTLINE =
  "inline-flex h-10 items-center gap-2 rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

/** A page's title block: optional cover beside it, a small label above, a meta line and actions under. */
export function PageHeader({
  eyebrow,
  title,
  meta,
  cover,
  actions,
}: {
  eyebrow?: string;
  title: string;
  meta?: string;
  /** Pass a node (an <img> or a mosaic) to show the detail-page layout. */
  cover?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={cover ? "mb-8 flex flex-col gap-6 sm:flex-row sm:items-end" : "mb-6"}>
      {cover && (
        <div className="aspect-square w-36 shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-md sm:w-40 dark:bg-zinc-900">
          {cover}
        </div>
      )}
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">{eyebrow}</p>}
        <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">{title}</h1>
        {meta && <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{meta}</p>}
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A filled search box. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-full bg-zinc-100 pr-4 pl-10 text-sm text-zinc-950 outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-accent/50 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </div>
  );
}

/** Nothing to list: an icon, one sentence, and optionally the way forward. */
export function EmptyState({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-900">
        {icon ?? <Music className="h-6 w-6" />}
      </span>
      <p className="mt-4 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A cover for a detail page's header: one picture, a 2x2 mosaic, or a music note. */
export function CoverArt({ covers }: { covers: string[] }) {
  if (covers.length === 1)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={covers[0]} alt="" className="h-full w-full object-cover" />;
  if (covers.length > 1)
    return (
      <div className="grid h-full w-full grid-cols-2 grid-rows-2">
        {Array.from({ length: 4 }).map((_, i) =>
          covers[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={covers[i]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div key={i} className="bg-zinc-200 dark:bg-zinc-800" />
          ),
        )}
      </div>
    );
  return (
    <div className="flex h-full w-full items-center justify-center text-zinc-400">
      <Music className="h-10 w-10" />
    </div>
  );
}

/** The small "‹ Back" link above a detail page's header. */
export const BACK =
  "-ml-1 mb-4 inline-flex h-8 items-center gap-1 rounded-lg pr-2 text-sm text-zinc-500 transition hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:text-zinc-400 dark:hover:text-zinc-50";

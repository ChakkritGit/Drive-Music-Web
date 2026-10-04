"use client";

import type { ReactNode } from "react";
import { Music, Play } from "lucide-react";

interface MediaCardProps {
  title: string;
  subtitle: string;
  /** Up to four covers: one fills the square, two or more make a 2x2 mosaic. */
  covers: string[];
  /** Shown when there is no cover at all. */
  icon?: ReactNode;
  /** Opens the collection. */
  onOpen: () => void;
  /** Starts it straight away, from the round button on the cover. */
  onPlay?: () => void;
}

export function MediaCard({ title, subtitle, covers, icon, onOpen, onPlay }: MediaCardProps) {
  return (
    <div className="group relative min-w-0">
      <button
        onClick={onOpen}
        className="block w-full rounded-lg text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <div className="aspect-square w-full overflow-hidden rounded-lg bg-zinc-100 shadow-sm dark:bg-zinc-900">
          {covers.length === 1 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={covers[0]} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          ) : covers.length > 1 ? (
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
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-400">
              {icon ?? <Music className="h-8 w-8" />}
            </div>
          )}
        </div>
        <p className="mt-3 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </button>
      {onPlay && (
        // Shown on hover or keyboard focus with a mouse; always there on a touch screen, which has no hover.
        <button
          onClick={onPlay}
          aria-label={`Play ${title}`}
          className="absolute right-2 bottom-[3.75rem] grid h-10 w-10 translate-y-1 place-items-center rounded-full bg-accent text-zinc-950 opacity-0 shadow-lg transition group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:outline-none [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
        >
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </button>
      )}
    </div>
  );
}

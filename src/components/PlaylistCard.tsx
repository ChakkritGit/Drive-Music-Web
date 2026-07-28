"use client";

import type { ReactNode } from "react";
import { Music } from "lucide-react";

interface PlaylistCardProps {
  title: string;
  subtitle: string;
  covers: string[];
  icon?: ReactNode;
  onPlay: () => void;
}

export function PlaylistCard({ title, subtitle, covers, icon, onPlay }: PlaylistCardProps) {
  return (
    <button
      onClick={onPlay}
      className="w-40 shrink-0 rounded-xl p-3 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
    >
      <div className="mb-3 aspect-square w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {covers.length === 1 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={covers[0]} alt="" className="h-full w-full object-cover" />
        ) : covers.length > 1 ? (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2">
            {Array.from({ length: 4 }).map((_, i) =>
              covers[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={covers[i]} alt="" className="h-full w-full object-cover" />
              ) : (
                <div key={i} className="bg-zinc-200 dark:bg-zinc-700" />
              ),
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">
            {icon ?? <Music className="h-8 w-8" />}
          </div>
        )}
      </div>
      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
      <p className="truncate text-xs text-zinc-400">{subtitle}</p>
    </button>
  );
}

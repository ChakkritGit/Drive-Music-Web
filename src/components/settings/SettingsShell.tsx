"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Page chrome for the settings list and every sub-page. The (app) layout around it owns the
// sign-in gate and the scrolling, as it does for every other page.
export function SettingsShell({
  title,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-10">
      <Link
        href={backHref}
        className="-ml-1 inline-flex h-8 items-center gap-1 rounded-lg pr-2 text-sm text-zinc-500 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h1>
      {children}
    </div>
  );
}

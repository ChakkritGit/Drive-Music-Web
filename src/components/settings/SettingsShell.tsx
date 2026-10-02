"use client";

import type { ReactNode } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SignInScreen } from "@/components/SignInScreen";

// Shared page chrome plus the sign-in gate, so the list and every sub-page behave the same.
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
  const { data: session, status } = useSession();

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
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Link
            href={backHref}
            className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
          <h1 className="truncate text-center text-base font-medium text-zinc-900 sm:text-lg dark:text-zinc-50">
            {title}
          </h1>
          <div className="w-[4.5rem]" />
        </div>
        {children}
      </div>
    </div>
  );
}

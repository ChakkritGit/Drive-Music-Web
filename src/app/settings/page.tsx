"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SignInScreen } from "@/components/SignInScreen";
import { usePlayer, MAX_CROSSFADE_SECONDS } from "@/components/PlayerContext";

export default function SettingsPage() {
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

  return <SettingsView />;
}

function SettingsView() {
  const { crossfadeEnabled, crossfadeSeconds, setCrossfadeEnabled, setCrossfadeSeconds } =
    usePlayer();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="truncate text-center text-base font-medium text-zinc-900 sm:text-lg dark:text-zinc-50">
            Settings
          </h1>
          <div className="w-[4.5rem]" />
        </div>

        <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                Crossfade
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Smoothly blend the end of a track into the next one, instead of cutting
                straight across.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={crossfadeEnabled}
              onClick={() => setCrossfadeEnabled(!crossfadeEnabled)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                crossfadeEnabled ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform dark:bg-zinc-900 ${
                  crossfadeEnabled ? "translate-x-[1.375rem]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className={crossfadeEnabled ? "mt-5" : "mt-5 opacity-40"}>
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>Crossfade length</span>
              <span className="tabular-nums">{crossfadeSeconds.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={MAX_CROSSFADE_SECONDS}
              step={0.5}
              value={crossfadeSeconds}
              disabled={!crossfadeEnabled}
              onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
              className="w-full accent-zinc-900 disabled:cursor-not-allowed dark:accent-zinc-100"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>0s</span>
              <span>{MAX_CROSSFADE_SECONDS}s</span>
            </div>
          </div>

          <p className="mt-4 text-[11px] text-zinc-400">
            Only kicks in between tracks that are already downloaded — an automatic transition
            to a track that still needs to download plays normally instead of cutting the fade
            short.
          </p>
        </section>
      </div>
    </div>
  );
}

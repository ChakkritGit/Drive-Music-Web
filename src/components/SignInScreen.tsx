"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { Music } from "lucide-react";

export function SignInScreen() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 p-8 text-center shadow-sm dark:border-zinc-800">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100">
          <Music className="h-6 w-6 text-white dark:text-zinc-900" />
        </div>
        <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Drive Music</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Drive Music is a personal audio player for the music files already sitting in your
          Google Drive — browse your folders, play tracks, download them for offline listening,
          and build playlists, all from your own Drive.
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          Sign in with Google to grant read-only access to your Drive — Drive Music never
          edits, uploads, or deletes anything there.
        </p>
        <button
          onClick={() => signIn("google")}
          className="mt-6 w-full rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign in with Google
        </button>
        <p className="mt-4 text-[11px] text-zinc-400">
          By continuing, you agree to the{" "}
          <Link href="/terms" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

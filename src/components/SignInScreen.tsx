"use client";

import { signIn } from "next-auth/react";
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
          Sign in with Google to browse and play music from your Drive.
        </p>
        <button
          onClick={() => signIn("google")}
          className="mt-6 w-full rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

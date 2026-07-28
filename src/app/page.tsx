"use client";

import { useSession } from "next-auth/react";
import { SignInScreen } from "@/components/SignInScreen";
import { MusicApp } from "@/components/MusicApp";

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading…</div>
    );
  }

  if (!session) {
    return <SignInScreen />;
  }

  return <MusicApp session={session} />;
}

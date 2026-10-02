"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { claimForAccount } from "@/lib/db";
import { syncRoomId } from "@/lib/sync";

// The database is shared across accounts on one browser. Signing out alone does not clear it,
// on purpose, so the same person keeps their downloads; signing in as someone else does.
export function AccountGuard() {
  const { data: session, status } = useSession();
  const email = session?.user?.email;

  useEffect(() => {
    if (status !== "authenticated" || !email) return;
    syncRoomId(email)
      .then(claimForAccount)
      // In-memory player state (e.g. a restored queue) still belongs to the previous account.
      .then((cleared) => {
        if (cleared) window.location.reload();
      })
      .catch((err) => console.error("Account check failed", err));
  }, [status, email]);

  return null;
}

"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { claimForAccount, clearAllData } from "@/lib/db";
import { syncRoomId } from "@/lib/sync";

// The database is shared across accounts on one browser. Signing out alone does not clear it,
// on purpose, so the same person keeps their downloads; signing in as someone else does.
// ponytail: the app renders before this check resolves, so after an account switch the previous
// account's library can flash for a moment before the reload. Not gated, because the server
// render must show the policy links to Google; a per-account database name closes it fully.
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
      // Fails closed: when the owner of the data can't be confirmed, the data goes, not stays.
      .catch(async (err) => {
        console.error("Account check failed", err);
        // No reload here: a check that always throws would reload forever.
        try {
          await clearAllData();
        } catch (clearErr) {
          console.error("Clearing local data failed", clearErr);
        }
      });
  }, [status, email]);

  return null;
}

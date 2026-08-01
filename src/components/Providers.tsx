"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ToastContext";
import { PlayerProvider } from "@/components/PlayerContext";
import { PlaylistsProvider } from "@/components/PlaylistsContext";
import { SyncProvider } from "@/components/SyncContext";
import { Player } from "@/components/Player";
import { FullPlayer } from "@/components/FullPlayer";
import { LoudnessAnalysisIndicator } from "@/components/LoudnessAnalysisIndicator";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) =>
          console.error("Service worker registration failed", err),
        );
    }
  }, []);

  return (
    <SessionProvider>
      <ToastProvider>
        {/* Player/Playlists state (and the actual <audio> element) live here, above every
            route, so playback keeps going when navigating between pages (e.g. to /admin
            and back) instead of being torn down and rebuilt each time. */}
        <PlayerProvider>
          {/* Needs usePlayer() (to broadcast local state and apply "Play here"), so it's
              nested inside PlayerProvider rather than alongside it. */}
          <SyncProvider>
            <PlaylistsProvider>
              {children}
              <Player />
              <FullPlayer />
              <LoudnessAnalysisIndicator />
            </PlaylistsProvider>
          </SyncProvider>
        </PlayerProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

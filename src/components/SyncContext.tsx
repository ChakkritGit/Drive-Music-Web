"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import usePartySocket from "partysocket/react";
import type { SyncState } from "@/types";
import { usePlayer } from "@/components/PlayerContext";

// Structural changes (track, play/pause, source) publish immediately; a still-playing track's
// progress otherwise only re-publishes at most this often, so "now playing" catches up on
// another device in roughly real time without spamming a message every progress tick.
const PUBLISH_THROTTLE_MS = 3000;
// Forces a fresh publish at least this often even with nothing structurally changing — the
// heartbeat other devices rely on to know this device (and its state) is still around.
const HEARTBEAT_MS = 15000;
// A device that goes quiet (closed tab, lost network, ...) never gets to send a "goodbye" —
// so a remote broadcast is only trusted for a few missed heartbeats before being treated as
// stale and cleared, rather than showing "Playing on X" forever for a device that isn't.
const STALE_MS = HEARTBEAT_MS * 3;
const DEVICE_ID_KEY = "drive-music-device-id";
const DEVICE_NAME_KEY = "drive-music-device-name";

function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac/.test(ua)
      ? "Mac"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : "";
  return os ? `${browser} on ${os}` : browser;
}

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

interface SyncContextValue {
  /** The latest broadcast from a *different* device, or null if nothing's playing elsewhere
   * (or we haven't heard from another device yet). */
  remoteNowPlaying: SyncState | null;
  /** Pulls remoteNowPlaying's queue/track into this device's own player and starts it here. */
  claimPlayback: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within a SyncProvider");
  return ctx;
}

interface SyncTokenResponse {
  token: string;
  roomId: string;
}

async function fetchSyncToken(): Promise<SyncTokenResponse | null> {
  try {
    const res = await fetch("/api/sync-token");
    if (!res.ok) return null;
    return (await res.json()) as SyncTokenResponse;
  } catch {
    return null;
  }
}

/** Mirrors "what's playing" across every tab/device signed into the same Google account, via
 * a PartyKit room (party/index.ts) keyed to that account. Purely additive: it reads from
 * PlayerContext to broadcast this device's own state, and only ever calls back into it
 * (`play(...)`) when the user explicitly hits "Play here" — it never silently takes over
 * local playback on its own. Deliberately does not do remote control (pausing/seeking another
 * device from here) — only mirroring + pulling playback to the current device. */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const player = usePlayer();
  const [deviceId] = useState(getOrCreateDeviceId);
  const [deviceName] = useState(
    () =>
      (typeof window !== "undefined" &&
        localStorage.getItem(DEVICE_NAME_KEY)) ||
      guessDeviceName(),
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [remoteNowPlaying, setRemoteNowPlaying] = useState<SyncState | null>(
    null,
  );
  const lastPublishedKeyRef = useRef("");
  const lastPublishTimeRef = useRef(0);
  // Bumped on an interval purely to re-run the outbound-publish effect below on a heartbeat
  // cadence, even when nothing about local playback has actually changed.
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHeartbeatTick((t) => t + 1), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);
  // Lets claimPlayback always call the latest play() without needing `player` (which changes
  // identity on every progress tick) in its own dependency array.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });

  const hostConfigured = Boolean(process.env.NEXT_PUBLIC_PARTYKIT_HOST);

  // Resolve which room to join once signed in — the id is derived server-side (see
  // src/app/api/sync-token/route.ts) so the client never needs to hash the email itself.
  useEffect(() => {
    if (status !== "authenticated" || !hostConfigured) return;
    let cancelled = false;
    fetchSyncToken().then((result) => {
      if (!cancelled && result) setRoomId(result.roomId);
    });
    return () => {
      cancelled = true;
    };
  }, [status, hostConfigured]);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "",
    // Matches the Durable Object binding name in wrangler.jsonc ("SyncServer" kebab-cased) —
    // partyserver routes /parties/:party/:room to the env binding whose name kebab-cases to
    // :party, see party/index.ts.
    party: "sync-server",
    room: roomId ?? "unset",
    enabled: status === "authenticated" && hostConfigured && Boolean(roomId),
    // Re-fetches a fresh (short-lived) token on every connect/reconnect attempt.
    query: async () => ({ token: (await fetchSyncToken())?.token ?? "" }),
    onMessage(event) {
      if (typeof event.data !== "string") return;
      try {
        const state = JSON.parse(event.data) as SyncState;
        if (state.deviceId !== deviceId) setRemoteNowPlaying(state);
      } catch {
        // Ignore malformed messages rather than crash the socket handler.
      }
    },
  });

  useEffect(() => {
    if (status !== "authenticated" || !roomId || !hostConfigured) return;
    if (!player.currentFile) return; // nothing loaded here yet — don't publish an empty state

    const structuralKey = `${player.currentFile.id}:${player.isPlaying}:${player.currentSource?.id ?? ""}`;
    const now = Date.now();
    const isStructuralChange = structuralKey !== lastPublishedKeyRef.current;
    if (
      !isStructuralChange &&
      now - lastPublishTimeRef.current < PUBLISH_THROTTLE_MS
    )
      return;
    lastPublishedKeyRef.current = structuralKey;
    lastPublishTimeRef.current = now;

    const state: SyncState = {
      queue: player.queue,
      currentIndex: player.queue.findIndex(
        (f) => f.id === player.currentFile!.id,
      ),
      source: player.currentSource,
      progress: player.progress,
      isPlaying: player.isPlaying,
      shuffle: player.shuffle,
      loopMode: player.loopMode,
      deviceId,
      deviceName,
      updatedAt: now,
    };
    socket.send(JSON.stringify(state));
  }, [
    status,
    roomId,
    hostConfigured,
    player.currentFile,
    player.isPlaying,
    player.progress,
    player.queue,
    player.currentSource,
    player.shuffle,
    player.loopMode,
    deviceId,
    deviceName,
    socket,
    heartbeatTick,
  ]);

  // Broadcasts from a device that's gone quiet (closed tab, lost network, ...) never get a
  // "goodbye" — so once a remote state hasn't been refreshed for a few missed heartbeats,
  // stop trusting it rather than showing "Playing on X" forever for a device that isn't.
  useEffect(() => {
    if (!remoteNowPlaying) return;
    const id = setInterval(() => {
      setRemoteNowPlaying((current) =>
        current && Date.now() - current.updatedAt > STALE_MS ? null : current,
      );
    }, 5000);
    return () => clearInterval(id);
  }, [remoteNowPlaying]);

  const claimPlayback = useCallback(() => {
    if (!remoteNowPlaying) return;
    playerRef.current.play(
      remoteNowPlaying.queue,
      remoteNowPlaying.currentIndex,
      remoteNowPlaying.source ?? undefined,
    );
    setRemoteNowPlaying(null);
  }, [remoteNowPlaying]);

  const value = useMemo<SyncContextValue>(
    () => ({ remoteNowPlaying, claimPlayback }),
    [remoteNowPlaying, claimPlayback],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

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
import { follow, type Seen } from "@/lib/follow";
import { syncMode, type SyncMode } from "@/lib/syncMode";

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
// How far local playback position is allowed to drift from the synced group's estimated
// position (network/publish latency, buffering, ...) before snapping back in line.
const SYNC_DRIFT_TOLERANCE_SEC = 1.5;

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
  /** Whether this device is synced at all (leading or following). */
  synced: boolean;
  /** Solo or leading; the quick toggle the phone's Now Playing uses. */
  toggleSynced: () => void;
  mode: SyncMode;
  /** "solo" plays here alone; "lead" keeps the other device in step with only this one heard. */
  chooseMode: (mode: "solo" | "lead") => void;
  /** The leading device's name while following. */
  leaderName: string | null;
  /** Whether sync is configured at all (a PartyKit host is set) — lets UI hide sync controls
   * entirely rather than show a toggle that can never connect. */
  syncAvailable: boolean;
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
 * a PartyKit room (party/index.ts) keyed to that account. Every device always broadcasts its
 * own state (used for the passive "Playing on X" banner). Devices that opt into `synced`
 * ("Listen together") additionally *apply* every incoming broadcast — track, play/pause, and
 * position — to their own local playback. Since a synced device's own actions get broadcast
 * the same way, two synced devices end up symmetric: whichever one you touch last (play,
 * pause, seek, skip) becomes the state the other pulls itself back in line with. */
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
  // Lets the reconciliation effect below always call the latest play()/togglePlay()/seek()
  // without needing `player` (which changes identity on every progress tick) in its deps.
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

  const [chosen, setChosen] = useState<"solo" | "lead">("solo");
  const [leadSince, setLeadSince] = useState(0);
  /** The lead (by its leadSince) this device stepped out of to play on its own. */
  const [optedOutOf, setOptedOutOf] = useState<number | null>(null);
  /** The remote state last acted on; see follow() for why changes, not levels, are followed. */
  const followedRef = useRef<Seen | null>(null);
  /** Set by the user's own choice, so the mode change it causes is not mistaken for the leader leaving. */
  const choseRef = useRef(false);
  const chooseMode = useCallback((next: "solo" | "lead") => {
    choseRef.current = true;
    // Joining adopts the other device's state outright, once.
    followedRef.current = null;
    setChosen(next);
    if (next === "lead") setLeadSince(Date.now());
    // Leaving a follow for "this device only" must stop following that lead, or the leader's next
    // broadcast would pull this device straight back in.
    if (next === "solo" && remoteNowPlaying?.audioOn === remoteNowPlaying?.deviceId) {
      setOptedOutOf(remoteNowPlaying?.leadSince ?? 0);
    }
  }, [remoteNowPlaying]);
  const toggleSynced = useCallback(() => chooseMode(chosen === "solo" ? "lead" : "solo"), [chosen, chooseMode]);

  // Following is derived, not stored: another device's own broadcast says it leads. If both chose
  // to lead, the later choice wins and the other follows.
  const { mode, leaderId } = syncMode({ chosen, leadSince, optedOutOf, remote: remoteNowPlaying });
  const remoteLeader = leaderId ? remoteNowPlaying : null;
  const synced = mode !== "solo";

  // A follower is heard nowhere: only the leader's speakers play.
  useEffect(() => {
    playerRef.current.setOutputMuted(mode === "follow");
  }, [mode]);

  // When the leader stops leading (or goes quiet), a follower stops too, rather than suddenly
  // being heard. A follower that chose to play here itself carries on.
  const previousModeRef = useRef<SyncMode>(mode);
  useEffect(() => {
    const was = previousModeRef.current;
    previousModeRef.current = mode;
    const chose = choseRef.current;
    choseRef.current = false;
    if (was === "follow" && mode === "solo" && !chose && playerRef.current.isPlaying) {
      playerRef.current.togglePlay("sync");
    }
  }, [mode]);

  useEffect(() => {
    if (status !== "authenticated" || !roomId || !hostConfigured) return;
    if (!player.currentFile) return; // nothing loaded here yet — don't publish an empty state

    const structuralKey = `${player.currentFile.id}:${player.isPlaying}:${player.currentSource?.id ?? ""}:${mode}`;
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
      // Who is heard: this device while leading; while following, the leader (repeated, so the
      // leader's choice is not overturned by this device's broadcast).
      audioOn: mode === "lead" ? deviceId : mode === "follow" ? remoteLeader?.deviceId : undefined,
      leadSince: mode === "lead" ? leadSince : undefined,
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
    mode,
    leadSince,
    remoteLeader?.deviceId,
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


  // "Listen together": apply every incoming broadcast to local playback instead of just
  // showing it in the banner. Runs on every new remoteNowPlaying (at minimum every
  // HEARTBEAT_MS, immediately on a structural change) so drift — from network latency, a
  // manual seek, or one device pausing — gets pulled back in line within a few seconds.
  useEffect(() => {
    if (!synced || !remoteNowPlaying) return;
    const remote = remoteNowPlaying;
    const remoteFile = remote.queue[remote.currentIndex];
    if (!remoteFile) return;
    const local = playerRef.current;

    const decision = follow(
      followedRef.current,
      { fileId: remoteFile.id, isPlaying: remote.isPlaying },
      { fileId: local.currentFile?.id, isPlaying: local.isPlaying },
    );
    followedRef.current = decision.followed;
    if (decision.action === "load") local.play(remote.queue, remote.currentIndex, remote.source ?? undefined);
    if (decision.action === "toggle") local.togglePlay("sync");
    if (decision.action !== "track-position") return;

    const estimatedRemoteProgress = remote.isPlaying
      ? remote.progress + Math.max(0, (Date.now() - remote.updatedAt) / 1000)
      : remote.progress;
    if (Math.abs(local.progress - estimatedRemoteProgress) > SYNC_DRIFT_TOLERANCE_SEC) {
      local.seek(estimatedRemoteProgress);
    }
  }, [synced, remoteNowPlaying]);

  const value = useMemo<SyncContextValue>(
    () => ({
      remoteNowPlaying,
      synced,
      toggleSynced,
      mode,
      chooseMode,
      leaderName: mode === "follow" ? (remoteLeader?.deviceName ?? null) : null,
      syncAvailable: hostConfigured,
    }),
    [remoteNowPlaying, synced, toggleSynced, mode, chooseMode, remoteLeader, hostConfigured],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

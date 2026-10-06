"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import usePartySocket from "partysocket/react";
import { SharedPlayerProvider, usePlayer, type PlayerContextValue } from "@/components/PlayerContext";
import { useToast } from "@/components/ToastContext";
import { HEARTBEAT_MS, LEASE_MS, PARTY_PROTOCOL, positionAt, upcoming, type PartyCommand, type PartyPlayback, type PartyRoom } from "@/lib/party";

interface SyncContextValue {
  devices: PartyRoom["devices"];
  deviceId: string | null;
  outputId: string | null;
  pendingOutputId: string | null;
  selectOutput: (id: string) => void;
  connected: boolean;
  syncAvailable: boolean;
  outputName: string | null;
}
const SyncContext = createContext<SyncContextValue | null>(null);
export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within a SyncProvider");
  return ctx;
}
function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : "Safari";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Linux";
  return `${browser} on ${os}`;
}
async function fetchToken(): Promise<{ token: string; roomId: string } | null> {
  try { const r = await fetch("/api/sync-token", { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; }
}
function snapshot(p: PlayerContextValue): PartyPlayback | null {
  if (!p.currentFile || p.currentIndex === null) return null;
  // Artwork remains device-local to keep websocket messages bounded for large libraries.
  const { pictureDataUrl: _picture, ...meta } = p.currentMeta ?? {};
  void _picture;
  return { queue: p.queue, currentIndex: p.currentIndex, source: p.currentSource,
    progress: p.progress, duration: p.duration, isPlaying: p.isPlaying, shuffle: p.shuffle,
    shuffleOrder: p.shuffleOrder, playNextIndex: p.playNextIndex, loopMode: p.loopMode, meta, updatedAt: Date.now() };
}
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { status, data: session } = useSession();
  const player = usePlayer();
  const { showToast } = useToast();
  const available = Boolean(process.env.NEXT_PUBLIC_PARTYKIT_HOST);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lease, setLease] = useState(0);
  const [now, setNow] = useState(0);
  const playerRef = useRef(player);
  const roomRef = useRef(room);
  const idRef = useRef<string | null>(null);
  const leaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applied = useRef("");
  const leaseUntil = useRef(0);
  useEffect(() => { playerRef.current = player; });
  const silence = useCallback(() => {
    leaseUntil.current = 0;
    if (leaseTimer.current) clearTimeout(leaseTimer.current);
    playerRef.current.setOutputMuted(true);
    applied.current = "";
    setLease(0);
  }, []);

  useEffect(() => {
    if (!available || status !== "authenticated") return;
    let cancelled = false;
    const resolve = async () => {
      const result = await fetchToken();
      if (!cancelled && result) setRoomId(result.roomId);
    };
    void resolve();
    const timer = setInterval(resolve, 30000);
    return () => { cancelled = true; clearInterval(timer); setRoomId(null); setRoom(null); roomRef.current = null; silence(); };
  }, [available, status, session?.user?.email, silence]);

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "",
    party: "sync-server", room: roomId ?? "unset",
    enabled: available && status === "authenticated" && !!roomId,
    query: async () => ({ token: (await fetchToken())?.token ?? "" }),
    onOpen(event) {
      // Connection ids are allocated per socket (not localStorage), so two tabs are separate outputs.
      (event.target as WebSocket).send(JSON.stringify({ type: "hello", protocol: PARTY_PROTOCOL, name: deviceName() }));
    },
    onClose() { setConnected(false); silence(); },
    onError() { setConnected(false); silence(); },
    // This callback runs on websocket events, never during render.
    /* eslint-disable react-hooks/purity */
    onMessage(event) {
      if (typeof event.data !== "string") return;
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === "welcome") {
        idRef.current = m.deviceId; setDeviceId(m.deviceId); setConnected(true);
        socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
      } else if (m.type === "room" && m.protocol === PARTY_PROTOCOL) {
        if (m.playback && typeof m.serverTime === "number") {
          m.playback.updatedAt = Date.now() - Math.max(0, m.serverTime - m.playback.updatedAt);
        }
        roomRef.current = m; setRoom(m);
        if (m.outputId !== idRef.current) {
          silence();
          socket.send(JSON.stringify({ type: "released", revision: m.revision }));
        } else if (leaseUntil.current <= performance.now()) {
          socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
        }
      } else if (m.type === "lease" && m.granted && roomRef.current?.outputId === idRef.current && m.revision === roomRef.current.revision) {
        const until = m.sent + LEASE_MS;
        if (until <= performance.now() || until < leaseUntil.current) return;
        leaseUntil.current = until;
        if (leaseTimer.current) clearTimeout(leaseTimer.current);
        leaseTimer.current = setTimeout(silence, until - performance.now());
        playerRef.current.grantPartyLease(until);
        setLease(until);
      }
    },
    /* eslint-enable react-hooks/purity */
  });
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [socket, connected]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(timer); if (leaseTimer.current) clearTimeout(leaseTimer.current); };
  }, []);
  const command = useCallback((value: PartyCommand) => {
    if (!connected || socket.readyState !== WebSocket.OPEN) { showToast("Reconnect to Party Play to control playback."); return; }
    playerRef.current.unlockAudio();
    socket.send(JSON.stringify({ type: "command", command: value }));
  }, [connected, socket, showToast]);
  const setPartyCommandHandler = player.setPartyCommandHandler;
  useEffect(() => {
    setPartyCommandHandler(available ? command : null);
    return () => setPartyCommandHandler(null);
  }, [available, command, setPartyCommandHandler]);
  const selectOutput = useCallback((id: string) => {
    if (!connected || socket.readyState !== WebSocket.OPEN) return;
    if (id === idRef.current) playerRef.current.unlockAudio();
    socket.send(JSON.stringify({ type: "output", id, seed: snapshot(playerRef.current) }));
  }, [connected, socket]);

  useEffect(() => {
    if (!available) { playerRef.current.setOutputMuted(false); return; }
    if (!connected || !room || !deviceId || room.outputId !== deviceId || lease <= performance.now()) return;
    const key = `${deviceId}:${room.revision}`;
    if (applied.current === key) return;
    applied.current = key;
    playerRef.current.setOutputMuted(false);
    if (room.playback) playerRef.current.applyPartyPlayback(room.playback, room.revision);
  }, [available, connected, room, deviceId, lease]);

  // Only the output reports real playback (including automatic transitions and autoplay failures).
  // The revision barrier prevents a render from before a command echoing stale state back.
  const lastReport = useRef({ key: "", at: 0 });
  useEffect(() => {
    if (!connected || !room || room.outputId !== deviceId || leaseUntil.current <= performance.now()
      || player.syncRevision !== room.revision || player.isLoading || player.isPreviewingTransition) return;
    const p = snapshot(player);
    if (!p) return;
    const key = JSON.stringify({ ...p, progress: 0, updatedAt: 0 });
    if (key === lastReport.current.key && Date.now() - lastReport.current.at < 2000) return;
    lastReport.current = { key, at: Date.now() };
    socket.send(JSON.stringify({ type: "report", revision: room.revision, playback: p }));
  }, [connected, deviceId, room, player, socket]);

  const shared = useMemo((): PlayerContextValue => {
    if (!available) return player;
    const p = room?.playback;
    const currentFile = p?.queue[p.currentIndex] ?? player.currentFile;
    const localOutput = room?.outputId === deviceId;
    const preview = localOutput && player.isPreviewingTransition;
    return { ...player,
      ...(p ? { queue: p.queue, currentIndex: p.currentIndex, currentFile,
        currentSource: p.source, currentMeta: (currentFile && player.cachedTracks.get(currentFile.id)?.parsedMeta) || p.meta,
        isPlaying: preview ? player.isPlaying : p.isPlaying,
        isLoading: localOutput && player.isLoading,
        error: localOutput ? player.error : null,
        progress: room.outputId && !room.pendingOutputId ? positionAt(p, now || p.updatedAt) : p.progress,
        duration: p.duration, shuffle: p.shuffle, shuffleOrder: p.shuffleOrder, loopMode: p.loopMode,
        playNextIndex: p.playNextIndex, upNext: upcoming(p).map(index => ({ file: p.queue[index], index })),
      } : {}),
      play: (queue, index, source) => command({ type: "play", queue, index, source }),
      togglePlay: preview ? player.togglePlay : () => command({ type: "toggle" }),
      next: () => command({ type: "next" }), prev: () => command({ type: "previous" }),
      seek: seconds => command({ type: "seek", seconds }),
      toggleShuffle: () => command({ type: "shuffle" }), cycleLoopMode: () => command({ type: "loop" }),
      addToQueue: file => command({ type: "insert", file }),
      removeFromQueue: index => { const fileId = p?.queue[index]?.id; if (fileId) command({ type: "remove", index, fileId }); },
      previewTransition: (...args) => {
        if (!localOutput) { showToast("Select this device as the output to preview a mix."); return Promise.resolve(); }
        return player.previewTransition(...args);
      },
    };
  }, [available, player, room, deviceId, now, command, showToast]);
  const value = useMemo(() => ({ devices: room?.devices ?? [], deviceId, outputId: room?.outputId ?? null,
    pendingOutputId: room?.pendingOutputId ?? null, selectOutput, connected, syncAvailable: available,
    outputName: room?.devices.find(d => d.id === room.outputId)?.name ?? null,
  }), [room, deviceId, selectOutput, connected, available]);
  return <SyncContext.Provider value={value}><SharedPlayerProvider value={shared}>{children}</SharedPlayerProvider></SyncContext.Provider>;
}

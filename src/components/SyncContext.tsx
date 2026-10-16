"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import usePartySocket from "partysocket/react";
import { useAppAccess } from "@/components/AppAccessContext";
import { SharedPlayerProvider, usePlayer, type PlayerContextValue } from "@/components/PlayerContext";
import { useToast } from "@/components/ToastContext";
import { HEARTBEAT_MS, PARTY_PROTOCOL, describeDevice, leaseDeadline, playbackDisplay, positionAt, upcoming, validPlayerCommand, type DeviceKind, type PartyCommand, type PartyPlayback, type PartyRoom } from "@/lib/party";

interface SyncContextValue {
  devices: PartyRoom["devices"];
  deviceId: string | null;
  outputId: string | null;
  pendingOutputId: string | null;
  selectOutput: (id: string) => void;
  connected: boolean;
  syncAvailable: boolean;
  outputName: string | null;
  /** What kind of device the sound is on (for the "Playing on" bar and icons). */
  outputKind: DeviceKind | null;
  localPlayback: boolean;
}
const SyncContext = createContext<SyncContextValue | null>(null);
export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within a SyncProvider");
  return ctx;
}
const thisDevice = () => describeDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
async function fetchToken(): Promise<{ token: string; roomId: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try { const r = await fetch("/api/sync-token", { cache: "no-store", signal: controller.signal }); return r.ok ? await r.json() : null; } catch { return null; }
  finally { clearTimeout(timeout); }
}
function snapshot(p: PlayerContextValue): PartyPlayback | null {
  if (!p.currentFile || p.currentIndex === null) return null;
  // Artwork remains device-local to keep websocket messages bounded for large libraries.
  const { pictureDataUrl: _picture, ...meta } = p.currentMeta ?? {};
  void _picture;
  return { queue: p.queue, currentIndex: p.currentIndex, source: p.currentSource,
    progress: p.progress, duration: p.duration, isPlaying: p.isPlaying, shuffle: p.shuffle,
    shuffleOrder: p.shuffleOrder, playNextIndex: p.playNextIndex, loopMode: p.loopMode, meta, updatedAt: Date.now(), volume: p.volume };
}
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { status, data: session } = useSession();
  const { isOffline, isSignedOut } = useAppAccess();
  const player = usePlayer();
  const { showToast } = useToast();
  const available = Boolean(process.env.NEXT_PUBLIC_PARTYKIT_HOST);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lease, setLease] = useState(0);
  const [now, setNow] = useState(0);
  const [detached, setDetached] = useState(false);
  const detachedRef = useRef(false);
  const adoptLocalRef = useRef(false);
  const selectingHereRef = useRef(false);
  const selectionAcknowledgedRef = useRef(false);
  /** This device was the output when its connection dropped: decide on reconnect whether to take it back. */
  const reclaimRef = useRef(false);
  /** A room snapshot has arrived on the current connection (the server sends one on connect). */
  const freshRoomRef = useRef(false);
  /** The reconnect decision is waiting for that first snapshot. */
  const awaitingRoomRef = useRef(false);
  const acquired = useRef<{ generation: number; commandRevision: number; hydrationRevision: number | null; executionTick: number | null } | null>(null);
  const pendingCommands = useRef<{ generation: number; revision: number; command: PartyCommand }[]>([]);
  const [commandTick, setCommandTick] = useState(0);
  const playerRef = useRef(player);
  const roomRef = useRef(room);
  const idRef = useRef<string | null>(null);
  const leaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaseUntil = useRef(0);
  useEffect(() => { playerRef.current = player; });
  const silence = useCallback((reason = "Output changed or session ended") => {
    leaseUntil.current = 0;
    if (leaseTimer.current) clearTimeout(leaseTimer.current);
    playerRef.current.grantPartyLease(0);
    playerRef.current.setPartyLeaseRequired(false);
    playerRef.current.setOutputMuted(true, reason);
    acquired.current = null;
    pendingCommands.current = [];
    setLease(0);
  }, []);
  const detach = useCallback(() => {
    const local = !!acquired.current || roomRef.current?.outputId === idRef.current;
    leaseUntil.current = 0;
    if (leaseTimer.current) clearTimeout(leaseTimer.current);
    acquired.current = null;
    pendingCommands.current = [];
    playerRef.current.setPartyLeaseRequired(false);
    if (local) reclaimRef.current = true;
    if (local || detachedRef.current) {
      // A lost Party connection ends its session, not the main audio transport.
      detachedRef.current = true;
      setDetached(true);
      playerRef.current.setOutputMuted(false);
    }
    setLease(0);
  }, []);

  useEffect(() => {
    if (!available || status !== "authenticated" || isOffline || isSignedOut) return;
    let cancelled = false;
    const resolve = async () => {
      const result = await fetchToken();
      if (!cancelled && result) setRoomId(result.roomId);
    };
    void resolve();
    const timer = setInterval(resolve, 30000);
    return () => { cancelled = true; clearInterval(timer); detach(); setRoomId(null); setRoom(null); roomRef.current = null; setConnected(false); };
  }, [available, status, session?.user?.email, detach, isOffline, isSignedOut]);

  // After a dropped output reconnects: carry on as the output if the room is still free and the
  // music is playing (Spotify keeps the device that was playing), stop if another device took
  // over meanwhile, otherwise stay standalone as before.
  const socketRef = useRef<{ send: (data: string) => void } | null>(null);
  function resolveReconnect(r: PartyRoom) {
    reclaimRef.current = false;
    const send = (value: unknown) => socketRef.current?.send(JSON.stringify(value));
    const me = idRef.current;
    if ((r.outputId && r.outputId !== me) || (r.pendingOutputId && r.pendingOutputId !== me)) {
      detachedRef.current = false; setDetached(false);
      silence("Output selected on another device");
      return;
    }
    if (r.outputId === me) {
      detachedRef.current = false; setDetached(false);
      adoptLocalRef.current = playerRef.current.isPlaying;
      send({ type: "heartbeat", sent: performance.now() });
      return;
    }
    if (playerRef.current.isPlaying && !r.pendingOutputId && me) {
      selectionAcknowledgedRef.current = false;
      selectingHereRef.current = true;
      adoptLocalRef.current = true;
      send({ type: "output", id: me, seed: snapshot(playerRef.current), adoptLocal: true });
      return;
    }
    send({ type: "detach" });
  }

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "",
    party: "sync-server", room: roomId ?? "unset",
    enabled: available && status === "authenticated" && !!roomId && !isOffline && !isSignedOut,
    query: async () => ({ token: (await fetchToken())?.token ?? "" }),
    onOpen(event) {
      freshRoomRef.current = false;
      // IDs belong to this PartySocket instance: separate tabs, stable across reconnects.
      (event.target as WebSocket).send(JSON.stringify({ type: "hello", protocol: PARTY_PROTOCOL, ...thisDevice(), commands: true }));
    },
    onClose() { selectingHereRef.current = false; freshRoomRef.current = false; setConnected(false); detach(); },
    onError() { selectingHereRef.current = false; freshRoomRef.current = false; setConnected(false); detach(); },
    // This callback runs on websocket events, never during render.
    /* eslint-disable react-hooks/purity */
    onMessage(event) {
      if (isOffline || isSignedOut) return;
      if (typeof event.data !== "string") return;
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === "welcome") {
        idRef.current = m.deviceId; setDeviceId(m.deviceId); setConnected(true);
        if (detachedRef.current && reclaimRef.current && !selectingHereRef.current) {
          // The output's connection dropped (on a phone, typically the page suspended with the
          // screen off and woke at the next track). Decide against the room as it is now.
          if (freshRoomRef.current && roomRef.current) resolveReconnect(roomRef.current);
          else awaitingRoomRef.current = true;
        } else if (detachedRef.current) socket.send(JSON.stringify({ type: "detach" }));
        socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
      } else if (m.type === "heartbeat-request") {
        socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
      } else if (m.type === "room" && m.protocol === PARTY_PROTOCOL) {
        if (m.playback && typeof m.serverTime === "number") {
          m.playback.updatedAt = Date.now() - Math.max(0, m.serverTime - m.playback.updatedAt);
        }
        const previousOutput = roomRef.current?.outputId;
        roomRef.current = m; setRoom(m);
        freshRoomRef.current = true;
        if (m.outputId === idRef.current && previousOutput !== idRef.current && detachedRef.current && !selectingHereRef.current) {
          // Another device picked this one while it played on its own (its connection had
          // dropped). Rejoin rather than ignore the grant: the controller would never hear
          // from this output again. Still playing: keep that and report it. Idle: take the
          // room's queue, which is the controller handing its playback over.
          detachedRef.current = false; setDetached(false);
          reclaimRef.current = false;
          adoptLocalRef.current = playerRef.current.isPlaying;
        }
        if (selectingHereRef.current && m.pendingOutputId === idRef.current) selectionAcknowledgedRef.current = true;
        if (selectingHereRef.current && selectionAcknowledgedRef.current && ((m.pendingOutputId && m.pendingOutputId !== idRef.current)
          || (m.outputId && m.outputId !== idRef.current && m.outputId !== previousOutput))) {
          // A newer explicit device selection supersedes this takeover. Its grant
          // must not leave this device playing or accidentally rejoin it later.
          selectingHereRef.current = false;
          adoptLocalRef.current = false;
          detachedRef.current = false; setDetached(false);
          silence();
        }
        if (m.outputId === idRef.current && selectingHereRef.current) {
          selectingHereRef.current = false;
          detachedRef.current = false; setDetached(false);
          adoptLocalRef.current = true;
        }
        if (m.outputId !== idRef.current) {
          if (previousOutput === idRef.current && !m.outputId && !m.pendingOutputId) detach();
          else if (!detachedRef.current && (!adoptLocalRef.current || m.pendingOutputId)) {
            detachedRef.current = false; setDetached(false);
            silence();
          }
          socket.send(JSON.stringify({ type: "released", revision: m.revision }));
        } else if (leaseUntil.current <= performance.now()) {
          socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
        }
        if (awaitingRoomRef.current) { awaitingRoomRef.current = false; resolveReconnect(m); }
      } else if (validPlayerCommand(m) && m.outputId === idRef.current) {
        // The worker can flush queued controls before its grant snapshot arrives.
        // Keep those controls while an explicit local takeover is still pending.
        if (detachedRef.current && !selectingHereRef.current) return;
        const owner = acquired.current;
        if (owner && owner.generation === m.outputGeneration && m.revision <= owner.commandRevision) return;
        if (!pendingCommands.current.some(c => c.generation === m.outputGeneration && c.revision === m.revision)) {
          pendingCommands.current.push({ generation: m.outputGeneration, revision: m.revision, command: m.command });
          setCommandTick(tick => tick + 1);
        }
      } else if (m.type === "lease" && m.granted && typeof m.sent === "number" && Number.isFinite(m.sent)
        && roomRef.current?.outputId === idRef.current) {
        const until = leaseDeadline(m.sent, m.leaseMs);
        if (until <= performance.now() || until < leaseUntil.current) return;
        if (selectingHereRef.current) {
          // Selecting an output already granted to this device is idempotent on
          // the worker, so its lease can be the only confirmation we receive.
          selectingHereRef.current = false;
          detachedRef.current = false; setDetached(false);
          adoptLocalRef.current = true;
        }
        leaseUntil.current = until;
        if (leaseTimer.current) clearTimeout(leaseTimer.current);
        leaseTimer.current = setTimeout(() => {
          if (leaseUntil.current <= performance.now()) {
            detach();
            socket.close(4000, "Party output lease ended");
          }
        }, until - performance.now());
        playerRef.current.grantPartyLease(until);
        setLease(until);
      }
    },
    /* eslint-enable react-hooks/purity */
  });
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => {
    if (isSignedOut) {
      selectingHereRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize explicit logout with the external audio transport and socket
      silence("Signed out");
      socket.close(1000, "Signed out");
    } else if (isOffline) {
      detach();
      socket.close(1000, "Offline playback");
    }
  }, [isOffline, isSignedOut, detach, silence, socket]);
  useEffect(() => {
    if (!available) return;
    const leave = () => {
      // pagehide also covers reloads and the back/forward cache. Stop audio before
      // closing so the server can release this page's output immediately.
      silence("Page closed or refreshed");
      socket.close(1000, "Page closed or refreshed");
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) socket.reconnect();
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", restore);
    };
  }, [available, silence, socket]);
  useEffect(() => {
    if (!available || status !== "authenticated" || !roomId) return;
    const timer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
    }, HEARTBEAT_MS);
    const renew = () => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat", sent: performance.now() }));
      else if (socket.readyState === WebSocket.CLOSED) socket.reconnect();
    };
    document.addEventListener("visibilitychange", renew);
    window.addEventListener("online", renew);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", renew); window.removeEventListener("online", renew); };
  }, [socket, available, status, roomId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(timer); if (leaseTimer.current) clearTimeout(leaseTimer.current); };
  }, []);
  const command = useCallback((value: PartyCommand) => {
    if (isSignedOut) return;
    const current = roomRef.current;
    const local = detachedRef.current || !connected || !current?.outputId || current.outputId === idRef.current;
    if (local && (!current?.pendingOutputId || detachedRef.current || !connected)) {
      playerRef.current.unlockAudio();
      playerRef.current.setOutputMuted(false);
      playerRef.current.executePartyCommand(value);
      if (connected && socket.readyState === WebSocket.OPEN && !detachedRef.current && !current?.outputId && idRef.current) {
        // Adopt the running main player. The room will receive its actual state
        // after React commits, rather than echoing this click back as a command.
        adoptLocalRef.current = true;
        socket.send(JSON.stringify({ type: "output", id: idRef.current, seed: snapshot(playerRef.current) }));
      } else if (!connected || detachedRef.current) {
        detachedRef.current = true; setDetached(true);
        playerRef.current.setPartyLeaseRequired(false);
      }
      return;
    }
    if (!connected || socket.readyState !== WebSocket.OPEN) { showToast("Reconnect to Party Play to control another device."); return; }
    socket.send(JSON.stringify({ type: "command", command: value }));
  }, [connected, socket, showToast, isSignedOut]);
  // Remote volume like Spotify Connect: a dragged slider sends at most ~8 updates a second, always the last one.
  const volumeSend = useRef<{ timer: ReturnType<typeof setTimeout> | null; value: number | null; at: number }>({ timer: null, value: null, at: 0 });
  const remoteVolume = useCallback((value: number) => {
    const v = volumeSend.current;
    v.value = Math.max(0, Math.min(1, value));
    const flush = () => {
      v.timer = null;
      if (v.value === null) return;
      v.at = Date.now();
      command({ type: "volume", value: v.value });
      v.value = null;
    };
    const wait = 120 - (Date.now() - v.at);
    if (wait <= 0) flush();
    else if (!v.timer) v.timer = setTimeout(flush, wait);
  }, [command]);
  const setPartyCommandHandler = player.setPartyCommandHandler;
  useEffect(() => {
    setPartyCommandHandler(available ? command : null);
    return () => setPartyCommandHandler(null);
  }, [available, command, setPartyCommandHandler]);
  const selectOutput = useCallback((id: string) => {
    if (isSignedOut) return;
    reclaimRef.current = false;
    awaitingRoomRef.current = false;
    const here = id === idRef.current || id === "__local__";
    if (here) {
      const current = roomRef.current;
      if (current?.outputId === idRef.current && acquired.current && !detachedRef.current) { playerRef.current.unlockAudio(); return; }
      const remote = current?.playback;
      const alreadyLocal = detachedRef.current || current?.outputId === idRef.current;
      const seed = alreadyLocal ? snapshot(playerRef.current)
        : remote ? { ...remote, progress: positionAt(remote, Date.now()), updatedAt: Date.now() } : snapshot(playerRef.current);
      playerRef.current.unlockAudio();
      detach();
      detachedRef.current = true; setDetached(true);
      playerRef.current.setOutputMuted(false);
      playerRef.current.setPartyLeaseRequired(false);
      // Start cached audio in this gesture. Party confirmation later adopts the
      // running transport, rather than leaving Play blocked on another socket.
      if (seed && !alreadyLocal && !selectingHereRef.current) playerRef.current.applyPartyPlayback(seed, current?.revision ?? 0);
      if (connected && socket.readyState === WebSocket.OPEN && idRef.current && !isOffline) {
        if (!selectingHereRef.current) selectionAcknowledgedRef.current = false;
        selectingHereRef.current = true;
        adoptLocalRef.current = true;
        socket.send(JSON.stringify({ type: "output", id: idRef.current, seed, adoptLocal: true }));
      }
      return;
    }
    if (!connected || socket.readyState !== WebSocket.OPEN || isOffline) return;
    const seed = snapshot(playerRef.current);
    selectingHereRef.current = false;
    adoptLocalRef.current = false;
    detachedRef.current = false; setDetached(false);
    silence("Output selected on another device");
    socket.send(JSON.stringify({ type: "output", id, seed }));
  }, [connected, socket, silence, detach, isOffline, isSignedOut]);

  useEffect(() => {
    if (!available) { playerRef.current.setOutputMuted(false); return; }
    if (!connected || !room || !deviceId || detachedRef.current || room.outputId !== deviceId || lease <= performance.now()) return;
    const generation = room.outputGeneration ?? 0;
    if (acquired.current?.generation !== generation) {
      // Party owns the session and command routing, never the audio deadline.
      // A stalled network must not mute the main player on the audio thread.
      playerRef.current.setPartyLeaseRequired(false);
      playerRef.current.setOutputMuted(false);
      const hydrate = !!room.playback && !adoptLocalRef.current;
      acquired.current = { generation, commandRevision: 0, hydrationRevision: hydrate ? room.revision : null, executionTick: null };
      adoptLocalRef.current = false;
      if (hydrate) playerRef.current.applyPartyPlayback(room.playback!, room.revision);
      setCommandTick(tick => tick + 1);
      return;
    }
    const owner = acquired.current;
    if (owner.hydrationRevision !== null) {
      if (player.syncRevision !== owner.hydrationRevision || player.isLoading) return;
      owner.hydrationRevision = null;
    }
    // One command per committed render keeps rapid next/queue edits ordered
    // against the updated local state, including a transition completing nearby.
    pendingCommands.current = pendingCommands.current.filter(c => c.generation === generation && c.revision > owner.commandRevision);
    const next = pendingCommands.current.shift();
    if (!next) return;
    owner.commandRevision = next.revision;
    owner.executionTick = commandTick;
    playerRef.current.executePartyCommand(next.command);
    setCommandTick(tick => tick + 1);
  }, [available, connected, room, deviceId, lease, player, commandTick]);

  // This is the only path from the main transport to Party: report what really
  // played. Room mirrors never seek, reload or pause the selected output.
  const lastReport = useRef({ key: "", at: 0 });
  useEffect(() => {
    const owner = acquired.current;
    if (!connected || !room || detachedRef.current || room.outputId !== deviceId || leaseUntil.current <= performance.now()
      || !owner || owner.hydrationRevision !== null || owner.executionTick === commandTick || pendingCommands.current.length || player.isLoading || player.isPreviewingTransition) return;
    const p = snapshot(player);
    if (!p) return;
    const key = JSON.stringify({ ...p, progress: 0, updatedAt: 0, commandRevision: owner.commandRevision, generation: owner.generation });
    if (key === lastReport.current.key && Date.now() - lastReport.current.at < 2000) return;
    lastReport.current = { key, at: Date.now() };
    socket.send(JSON.stringify({ type: "report", revision: room.revision, commandRevision: owner.commandRevision, outputGeneration: owner.generation, playback: p }));
  }, [connected, deviceId, room, player, socket, commandTick]);

  const shared = useMemo((): PlayerContextValue => {
    if (!available) return player;
    const p = room?.playback;
    const localOutput = detached || !connected || !room?.outputId && !room?.pendingOutputId || room?.outputId === deviceId;
    const currentFile = localOutput ? player.currentFile : p?.queue[p.currentIndex] ?? player.currentFile;
    const preview = localOutput && player.isPreviewingTransition;
    return { ...player,
      ...(p && !localOutput ? { queue: p.queue, currentIndex: p.currentIndex, currentFile,
        currentSource: p.source, currentMeta: (currentFile && player.cachedTracks.get(currentFile.id)?.parsedMeta) || p.meta,
        ...playbackDisplay(room, player, localOutput, now || p.updatedAt),
        isLoading: localOutput && player.isLoading,
        error: localOutput ? player.error : null,
        shuffle: p.shuffle, shuffleOrder: p.shuffleOrder, loopMode: p.loopMode,
        playNextIndex: p.playNextIndex, upNext: upcoming(p).map(index => ({ file: p.queue[index], index })),
        volume: p.volume ?? player.volume,
      } : {}),
      changeVolume: localOutput ? player.changeVolume : remoteVolume,
      play: (queue, index, source) => command({ type: "play", queue, index, source }),
      togglePlay: preview ? player.togglePlay : () => command({ type: "toggle" }),
      next: () => command({ type: "next" }), prev: () => command({ type: "previous" }),
      seek: seconds => command({ type: "seek", seconds }),
      toggleShuffle: () => command({ type: "shuffle" }), cycleLoopMode: () => command({ type: "loop" }),
      addToQueue: file => command({ type: "insert", file }),
      removeFromQueue: index => { const fileId = (localOutput ? player.queue : p?.queue)?.[index]?.id; if (fileId) command({ type: "remove", index, fileId }); },
      previewTransition: (...args) => {
        if (!localOutput) { showToast("Select this device as the output to preview a mix."); return Promise.resolve(); }
        return player.previewTransition(...args);
      },
    };
  }, [available, player, room, deviceId, now, command, remoteVolume, showToast, detached, connected]);
  const localPlayback = detached || !connected || !room?.outputId && !room?.pendingOutputId || room?.outputId === deviceId;
  const value = useMemo(() => ({ devices: room?.devices ?? [], deviceId, outputId: room?.outputId ?? null,
    pendingOutputId: detached ? null : room?.pendingOutputId ?? null, selectOutput, connected, syncAvailable: available,
    outputName: available && localPlayback ? "This device" : room?.devices.find(d => d.id === room.outputId)?.name ?? null,
    outputKind: room?.devices.find(d => d.id === (localPlayback ? deviceId : room.outputId))?.kind ?? null,
    localPlayback,
  }), [room, deviceId, selectOutput, connected, available, localPlayback, detached]);
  return <SyncContext.Provider value={value}><SharedPlayerProvider value={shared}>{children}</SharedPlayerProvider></SyncContext.Provider>;
}

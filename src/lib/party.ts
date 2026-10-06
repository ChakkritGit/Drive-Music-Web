import type { DriveFile, ParsedMetadata, PlaySource } from "../types";

export const PARTY_PROTOCOL = 2;
export const LEASE_MS = 9000;
export const HEARTBEAT_MS = 2500;
export interface PartyPlayback {
  queue: DriveFile[];
  currentIndex: number;
  source: PlaySource | null;
  progress: number;
  duration: number;
  isPlaying: boolean;
  shuffle: boolean;
  shuffleOrder: number[];
  playNextIndex: number | null;
  loopMode: "off" | "all" | "one";
  meta: ParsedMetadata | null;
  updatedAt: number;
}
export interface PartyDevice { id: string; name: string }
export interface PartyRoom {
  type: "room";
  protocol: typeof PARTY_PROTOCOL;
  revision: number;
  devices: PartyDevice[];
  outputId: string | null;
  pendingOutputId: string | null;
  playback: PartyPlayback | null;
}
export type PartyCommand =
  | { type: "play"; queue: DriveFile[]; index: number; source?: PlaySource }
  | { type: "toggle" | "next" | "previous" | "shuffle" | "loop" }
  | { type: "playing"; value: boolean }
  | { type: "seek"; seconds: number }
  | { type: "insert"; file: DriveFile }
  | { type: "remove"; index: number; fileId: string };

export function positionAt(p: PartyPlayback, now: number): number {
  const at = p.progress + (p.isPlaying ? Math.max(0, now - p.updatedAt) / 1000 : 0);
  return p.duration > 0 ? Math.min(p.duration, at) : at;
}
export function upcoming(p: PartyPlayback): number[] {
  const order = p.shuffle ? p.shuffleOrder.slice(p.shuffleOrder.indexOf(p.currentIndex) + 1)
    : p.queue.map((_, i) => i).slice(p.currentIndex + 1);
  return [...(p.playNextIndex !== null ? [p.playNextIndex] : []), ...order.filter(i => i !== p.playNextIndex)]
    .filter(i => i !== p.currentIndex && !!p.queue[i]);
}
function shuffled(length: number, current: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter(i => i !== current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [current, ...rest];
}
/** Commands are reduced in arrival order by the room, never against a controller's stale queue. */
export function reducePlayback(previous: PartyPlayback | null, command: PartyCommand, now: number): PartyPlayback | null {
  if (command.type === "play") {
    if (!command.queue[command.index]) return previous;
    const same = previous?.queue.map(f => f.id).join("\0") === command.queue.map(f => f.id).join("\0");
    return { queue: command.queue, currentIndex: command.index, source: command.source ?? null,
      progress: 0, duration: 0, isPlaying: true, shuffle: previous?.shuffle ?? false,
      shuffleOrder: previous?.shuffle ? (same ? previous.shuffleOrder : shuffled(command.queue.length, command.index)) : [],
      playNextIndex: null, loopMode: previous?.loopMode ?? "off", meta: null, updatedAt: now };
  }
  if (!previous) {
    return command.type === "insert" ? reducePlayback(null, { type: "play", queue: [command.file], index: 0 }, now) : null;
  }
  const p = { ...previous, progress: positionAt(previous, now), updatedAt: now };
  switch (command.type) {
    case "toggle": p.isPlaying = !p.isPlaying; break;
    case "playing": p.isPlaying = command.value; break;
    case "seek": p.progress = Math.max(0, p.duration ? Math.min(p.duration, command.seconds) : command.seconds); break;
    case "loop": p.loopMode = p.loopMode === "off" ? "all" : p.loopMode === "all" ? "one" : "off"; break;
    case "shuffle": p.shuffle = !p.shuffle; p.shuffleOrder = p.shuffle ? shuffled(p.queue.length, p.currentIndex) : []; break;
    case "next":
    case "previous": {
      if (command.type === "previous" && p.progress > 3) { p.progress = 0; break; }
      const order = p.shuffle ? p.shuffleOrder : p.queue.map((_, i) => i);
      const at = order.indexOf(p.currentIndex);
      p.currentIndex = command.type === "next" && p.playNextIndex !== null ? p.playNextIndex
        : order[(at + (command.type === "next" ? 1 : -1) + order.length) % order.length];
      p.playNextIndex = null; p.progress = 0; p.duration = 0; p.meta = null; p.isPlaying = true;
      break;
    }
    case "insert": {
      if (p.queue[p.currentIndex]?.id === command.file.id) return previous;
      const oldQueue = p.queue;
      const currentId = oldQueue[p.currentIndex]?.id;
      const ids = p.shuffleOrder.map(i => oldQueue[i]?.id).filter(id => id !== command.file.id);
      p.queue = oldQueue.filter(f => f.id !== command.file.id);
      p.currentIndex = p.queue.findIndex(f => f.id === currentId);
      const insertAt = p.currentIndex + 1;
      p.queue.splice(insertAt, 0, command.file);
      p.playNextIndex = insertAt;
      ids.splice(ids.indexOf(currentId) + 1, 0, command.file.id);
      p.shuffleOrder = p.shuffle ? ids.map(id => p.queue.findIndex(f => f.id === id)) : [];
      break;
    }
    case "remove": {
      // An old controller index must never delete a different track after another edit.
      const i = command.index;
      if (p.queue[i]?.id !== command.fileId || i === p.currentIndex) return previous;
      p.queue = p.queue.filter((_, index) => index !== i);
      if (p.currentIndex > i) p.currentIndex--;
      p.shuffleOrder = p.shuffleOrder.filter(index => index !== i).map(index => index > i ? index - 1 : index);
      p.playNextIndex = p.playNextIndex === i ? null : p.playNextIndex !== null && p.playNextIndex > i ? p.playNextIndex - 1 : p.playNextIndex;
      break;
    }
  }
  return p;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const file = (v: unknown): v is DriveFile => object(v) && typeof v.id === "string" && v.id.length > 0 && v.id.length < 256 && typeof v.name === "string" && typeof v.mimeType === "string";
const queue = (v: unknown): v is DriveFile[] => Array.isArray(v) && v.length > 0 && v.length <= 10000 && v.every(file);
const source = (v: unknown) => v == null || (object(v) && ["folder", "playlist", "library"].includes(String(v.type)) && typeof v.id === "string" && typeof v.name === "string");
export function validCommand(v: unknown): v is PartyCommand {
  if (!object(v)) return false;
  switch (v.type) {
    case "toggle": case "next": case "previous": case "shuffle": case "loop": return true;
    case "playing": return typeof v.value === "boolean";
    case "seek": return finite(v.seconds);
    case "insert": return file(v.file);
    case "remove": return Number.isInteger(v.index) && finite(v.index) && typeof v.fileId === "string";
    case "play": return queue(v.queue) && Number.isInteger(v.index) && finite(v.index) && v.index < v.queue.length && source(v.source);
    default: return false;
  }
}
function validMeta(v: unknown): boolean {
  return v === null || (object(v) && ["title", "artist", "album", "pictureDataUrl"].every(key => v[key] === undefined || typeof v[key] === "string"));
}
export function validPlayback(v: unknown): v is PartyPlayback {
  if (!object(v) || !queue(v.queue) || !Number.isInteger(v.currentIndex) || !finite(v.currentIndex) || v.currentIndex >= v.queue.length) return false;
  return finite(v.progress) && finite(v.duration) && finite(v.updatedAt) && typeof v.isPlaying === "boolean" && typeof v.shuffle === "boolean"
    && ["off", "all", "one"].includes(String(v.loopMode)) && source(v.source)
    && validMeta(v.meta)
    && Array.isArray(v.shuffleOrder) && v.shuffleOrder.every(i => Number.isInteger(i) && i >= 0 && i < (v.queue as DriveFile[]).length)
    && (!v.shuffle || v.shuffleOrder.includes(v.currentIndex))
    && (v.playNextIndex === null || (Number.isInteger(v.playNextIndex) && finite(v.playNextIndex) && v.playNextIndex < v.queue.length));
}

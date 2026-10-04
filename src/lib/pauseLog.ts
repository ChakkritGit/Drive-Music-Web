/**
 * The last few times playback stopped, and who stopped it.
 *
 * Playback "stopping by itself" can come from the app (a button, the space bar, Listen
 * together), from the OS media controls (headphones, keyboard keys, the lock screen), or from
 * the browser on its own. Which one it was can't be told after the fact, so each stop is
 * written down as it happens and shown on /admin.
 */
export type PauseSource = "app" | "media-session" | "browser";

export interface PauseEntry {
  at: number;
  /** Seconds into the track. */
  position: number;
  source: PauseSource;
  hidden: boolean;
  /** The shared AudioContext's state at that moment, or "none" before the graph exists. */
  audio: string;
}

const KEY = "drive-music-pause-log";
const MAX = 30;

export function readPauseLog(): PauseEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PauseEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordPause(entry: PauseEntry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...readPauseLog()].slice(0, MAX)));
  } catch {
    // Private mode or a full quota: the log is a diagnostic, never worth failing playback over.
  }
}

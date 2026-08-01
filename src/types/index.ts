export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  iconLink?: string;
}

export interface ParsedMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  durationSec?: number;
  pictureDataUrl?: string;
}

export interface CachedTrack {
  fileId: string;
  blob: Blob;
  mimeType: string;
  driveMeta: DriveFile;
  parsedMeta: ParsedMetadata;
  cachedAt: number;
  /** Playback volume multiplier in (0, 1] that brings this track's loudness down to the
   * normalization target — see src/lib/loudness.ts. Undefined until analyzed (treated as 1,
   * i.e. unchanged) — analysis runs once in the background the first time a track is cached. */
  loudnessGain?: number;
}

/** Minimal shape needed to render and play a track, whichever source it came from. */
export interface TrackEntry {
  driveMeta: DriveFile;
  parsedMeta?: ParsedMetadata;
  cached: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  /** Full Drive file snapshots so a playlist can list/play tracks that haven't been downloaded yet. */
  tracks: DriveFile[];
  createdAt: number;
}

/** Identifies what a queue was played from, so Home can show "recently played". */
export interface PlaySource {
  type: "folder" | "playlist" | "library";
  id: string;
  name: string;
}

export interface RecentSource extends PlaySource {
  tracks: DriveFile[];
  lastPlayedAt: number;
  /** How many times this source has been played (started), across all time. */
  playCount: number;
}

/** A small online-trained 2-layer neural net (tanh hidden layer, sigmoid output) over hashed listening-context features (see src/lib/features.ts). */
export interface ListeningModel {
  id: "default";
  w1: number[][];
  b1: number[];
  w2: number[];
  b2: number;
  trainingEvents: number;
  updatedAt: number;
}

/** One training step's record: what the model predicted beforehand vs. what actually happened. */
export interface ModelEvent {
  id: string;
  trackId: string;
  title: string;
  fraction: number;
  predicted: number;
  at: number;
}

/** A snapshot of "what was playing and how" — saved continuously so a page refresh (or
 * navigating to /admin and back) can restore the last track, its queue/source, and
 * playback settings instead of losing them. */
export interface PlaybackSession {
  id: "default";
  queue: DriveFile[];
  currentIndex: number;
  source: PlaySource | null;
  progress: number;
  shuffle: boolean;
  /** The live shuffle window (see seedShuffleWindow/growShuffleWindow in PlayerContext) —
   * persisted so a refresh doesn't re-roll a fresh random order for the same session. */
  shuffleOrder: number[];
  loopMode: "off" | "all" | "one";
  volume: number;
}

/** Broadcast across every tab/device signed into the same Google account (via PartyKit) so
 * they can mirror "what's playing" — see src/components/SyncContext.tsx. Deliberately carries
 * the full queue (not just a track id) so a device that's never seen this folder/playlist
 * before can still "Play here" without needing it already cached or synced locally. */
export interface SyncState {
  queue: DriveFile[];
  currentIndex: number;
  source: PlaySource | null;
  progress: number;
  isPlaying: boolean;
  shuffle: boolean;
  loopMode: "off" | "all" | "one";
  deviceId: string;
  deviceName: string;
  updatedAt: number;
}

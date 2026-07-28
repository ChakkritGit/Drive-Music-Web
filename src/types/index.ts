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
  loopMode: "off" | "all" | "one";
  volume: number;
}

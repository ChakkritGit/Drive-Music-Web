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

/**
 * What the mix engine needs to know about a track beyond "where the audio file is": how fast it
 * is, where its beats fall, what key it's in, and a coarse picture of its loudness over time.
 *
 * Computed once per track by src/lib/analyzer.ts (reading the decoded audio) and cached in
 * IndexedDB — the analysis takes a second or more on a full track, far too slow to run at the
 * moment a transition needs the answer. Every measurement is optional: a track whose tempo couldn't be
 * found gets `bpm: undefined` and simply doesn't get beat-aligned, rather than a wrong number
 * that the mix then trusts.
 */
export interface TrackAnalysis {
  fileId: string;
  /** Detected tempo. Undefined when detection wasn't confident enough. */
  bpm?: number;
  /** Seconds from the start of the file to the first detected beat. Meaningless without `bpm`;
   * together the two describe the whole beat grid, since analysis assumes a constant tempo. */
  firstBeatSeconds?: number;
  /** Musical key in Camelot notation ("8A", "5B", ...) — the wheel DJs use because adjacent
   * numbers are a fifth apart and A/B at the same number are relative minor/major. */
  camelotKey?: string;
  /** Where the track is worth mixing *into* — past the intro, at the first bar line where the
   * music is properly underway. Distinct from `firstBeatSeconds`, which is only the grid's
   * phase within a single beat and so always lands within a second of the file's start. */
  mixInSeconds?: number;
  /** Where the track is worth mixing *out* of — the moment its last full-strength section ends
   * and the outro begins. Undefined when the track has no discernible outro, which includes the
   * common case of a hard ending. */
  mixOutSeconds?: number;
  /** Length of the analyzed audio, in seconds. Stored because the waveform is normalized over
   * the whole track, so turning a position on it into a time needs the track's length. */
  durationSeconds?: number;
  /** Highest frequency, in Hz, that still carries real energy — the point a lossy encoder cut
   * the track off at. The honest measure of "what quality is this file really?", and a better
   * one than the bitrate a container claims. */
  spectralCutoffHz?: number;
  /** Normalized 0..1 loudness envelope over the whole track, evenly spaced. Draws the waveform
   * in the transition editor and picks the mix points; deliberately coarse. */
  waveform: number[];
  /** Analyzer version that produced this. Bumped when the algorithm changes so stale cached
   * results get recomputed instead of silently outliving the code that made them. */
  version: number;
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

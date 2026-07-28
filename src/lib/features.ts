import type { DriveFile, ParsedMetadata } from "@/types";

const TIME_BUCKETS = 4;
const DAY_BUCKETS = 2;
const ARTIST_BUCKETS = 16;
const ALBUM_BUCKETS = 16;
const TRACK_BUCKETS = 8;

export const FEATURE_SIZE = 1 + TIME_BUCKETS + DAY_BUCKETS + ARTIST_BUCKETS + ALBUM_BUCKETS + TRACK_BUCKETS;

/** Describes how FEATURE_SIZE's dimensions are laid out, in order — the single source of truth for anything (e.g. the admin dashboard) that wants to summarize the weight vector by group. */
export const FEATURE_GROUPS: { label: string; size: number }[] = [
  { label: "Bias", size: 1 },
  { label: "Time of day", size: TIME_BUCKETS },
  { label: "Weekday", size: DAY_BUCKETS },
  { label: "Artist", size: ARTIST_BUCKETS },
  { label: "Album", size: ALBUM_BUCKETS },
  { label: "Track", size: TRACK_BUCKETS },
];

function hashString(value: string, buckets: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % buckets;
}

function timeBucket(hour: number): number {
  if (hour < 6) return 0; // night
  if (hour < 12) return 1; // morning
  if (hour < 18) return 2; // afternoon
  return 3; // evening
}

/** Turns a track (+ optional parsed metadata + listening context) into a fixed-length feature vector via hashing, so unbounded artist/album/track vocab stays a small dense array. */
export function extractFeatures(file: DriveFile, meta: ParsedMetadata | undefined, at: Date): number[] {
  const features = new Array(FEATURE_SIZE).fill(0);
  let offset = 0;

  features[offset] = 1; // bias
  offset += 1;

  features[offset + timeBucket(at.getHours())] = 1;
  offset += TIME_BUCKETS;

  const day = at.getDay();
  features[offset + (day === 0 || day === 6 ? 1 : 0)] = 1;
  offset += DAY_BUCKETS;

  features[offset + hashString(meta?.artist ?? "unknown-artist", ARTIST_BUCKETS)] = 1;
  offset += ARTIST_BUCKETS;

  features[offset + hashString(meta?.album ?? "unknown-album", ALBUM_BUCKETS)] = 1;
  offset += ALBUM_BUCKETS;

  features[offset + hashString(file.id, TRACK_BUCKETS)] = 1;
  offset += TRACK_BUCKETS;

  return features;
}

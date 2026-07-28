import { parseBlob, selectCover } from "music-metadata";
import type { DriveFile, ParsedMetadata } from "@/types";

function pictureToDataUrl(picture: { format: string; data: Uint8Array }): string {
  let binary = "";
  for (const byte of picture.data) binary += String.fromCharCode(byte);
  return `data:${picture.format};base64,${btoa(binary)}`;
}

/** Parses embedded tags (ID3v2, MP4, FLAC, Vorbis comments, ...) from a downloaded audio Blob, falling back to Drive's own file metadata when tags are missing. */
export async function parseTrackMetadata(blob: Blob, driveMeta: DriveFile): Promise<ParsedMetadata> {
  const fallback: ParsedMetadata = {
    title: stripExtension(driveMeta.name),
  };

  try {
    const { common, format } = await parseBlob(blob);
    const cover = selectCover(common.picture);

    return {
      title: common.title || fallback.title,
      artist: common.artist || common.albumartist,
      album: common.album,
      year: common.year,
      durationSec: format.duration,
      pictureDataUrl: cover ? pictureToDataUrl(cover) : undefined,
    };
  } catch (error) {
    console.warn(`Could not parse metadata for ${driveMeta.name}`, error);
    return fallback;
  }
}

function stripExtension(name: string): string {
  return name.replace(/\.[^./]+$/, "");
}

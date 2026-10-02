import { FOLDER_MIME_TYPE, type DriveFile } from "@/types";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const FIELDS = "id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink";

export class DriveApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DriveApiError";
  }
}

async function driveFetch(url: string, accessToken: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new DriveApiError(`Drive API request failed: ${res.status} ${res.statusText}`, res.status);
  }
  return res;
}

/** Lists subfolders and audio files directly inside the given folder (folders first, then files, both name-sorted). */
export async function listFolder(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed = false and (mimeType = '${FOLDER_MIME_TYPE}' or mimeType contains 'audio/')`;

  const results: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken, files(${FIELDS})`,
      orderBy: "folder,name",
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await driveFetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, accessToken);
    const data: { files: DriveFile[]; nextPageToken?: string } = await res.json();
    results.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

export async function getFileMetadata(accessToken: string, fileId: string): Promise<DriveFile> {
  const res = await driveFetch(`${DRIVE_FILES_ENDPOINT}/${fileId}?fields=${FIELDS}`, accessToken);
  return res.json();
}

/** Downloads the raw bytes of a Drive file as a Blob, tagging it with the file's mimeType for correct playback. */
export async function downloadFile(accessToken: string, file: DriveFile): Promise<Blob> {
  const res = await driveFetch(`${DRIVE_FILES_ENDPOINT}/${file.id}?alt=media`, accessToken);
  const buffer = await res.arrayBuffer();
  return new Blob([buffer], { type: file.mimeType || "application/octet-stream" });
}

/**
 * downloadFile, retried once with a fresh token on a 401.
 *
 * The browser's copy of the Google token is only refetched when the session is (on tab focus),
 * so after an hour of listening in the background the next download got a 401 and playback
 * stopped until the tab was focused again. `refresh` asks the server for the session, which
 * runs its token refresh, and resolves the new access token.
 */
export async function downloadFileFresh(
  accessToken: string,
  file: DriveFile,
  refresh: () => Promise<string | undefined>,
): Promise<Blob> {
  try {
    return await downloadFile(accessToken, file);
  } catch (err) {
    if (!(err instanceof DriveApiError && err.status === 401)) throw err;
    const fresh = await refresh();
    // The same token back means the server's refresh failed too; the original error stands.
    if (!fresh || fresh === accessToken) throw err;
    return downloadFile(fresh, file);
  }
}

export function isFolder(file: DriveFile): boolean {
  return file.mimeType === FOLDER_MIME_TYPE;
}

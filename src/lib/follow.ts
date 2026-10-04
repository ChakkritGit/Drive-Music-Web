/**
 * What Listen together does with one broadcast from the other device.
 *
 * Only the other device's *changes* are followed: a new track, or a play state different from
 * the one last acted on. Following its whole state on every heartbeat let an idle, paused device
 * pause this one seconds after play was pressed here.
 */
export type Seen = { fileId: string; isPlaying: boolean };
export type FollowAction = "load" | "toggle" | "track-position" | "none";

export function follow(
  followed: Seen | null,
  remote: Seen,
  local: { fileId: string | undefined; isPlaying: boolean },
): { action: FollowAction; followed: Seen } {
  const newTrack = !followed || followed.fileId !== remote.fileId;
  const newPlayState = !followed || followed.isPlaying !== remote.isPlaying;

  if (newTrack && local.fileId !== remote.fileId) {
    // Its play state is applied on the next broadcast, once the track has loaded here.
    return { action: "load", followed: { fileId: remote.fileId, isPlaying: !remote.isPlaying } };
  }
  const seen = { fileId: remote.fileId, isPlaying: remote.isPlaying };
  if (local.fileId !== remote.fileId) return { action: "none", followed: seen }; // moved on here
  if (newPlayState && remote.isPlaying !== local.isPlaying) return { action: "toggle", followed: seen };
  // Position only while both play the same track: a paused remote's position is where it stopped.
  return { action: remote.isPlaying && local.isPlaying ? "track-position" : "none", followed: seen };
}

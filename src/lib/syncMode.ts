import type { SyncState } from "@/types";

export type SyncMode = "solo" | "lead" | "follow";

/**
 * This device's part in sync, from what it chose and what the other device last said.
 *
 * It follows when another device announces it leads (its own broadcast names itself in
 * `audioOn`), unless this device stepped out of that very lead (`optedOutOf`, the lead's
 * `leadSince`), or chose to lead later than the other did.
 */
export function syncMode(o: {
  chosen: "solo" | "lead";
  leadSince: number;
  optedOutOf: number | null;
  remote: Pick<SyncState, "deviceId" | "audioOn" | "leadSince"> | null;
}): { mode: SyncMode; leaderId: string | null } {
  const leader = o.remote && o.remote.audioOn === o.remote.deviceId ? o.remote : null;
  const theirs = leader?.leadSince ?? 0;
  const following = !!leader && theirs !== o.optedOutOf && !(o.chosen === "lead" && o.leadSince > theirs);
  return { mode: following ? "follow" : o.chosen, leaderId: following ? leader!.deviceId : null };
}

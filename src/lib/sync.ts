/**
 * Room id for the cross-device sync party: a hex SHA-256 digest of the signed-in Google
 * account's email, so the PartyKit room name never exposes the raw email. Uses Web Crypto's
 * `crypto.subtle`, which is the one hashing API available unchanged in the browser, the
 * Next.js server (Node 19+), and the Cloudflare Workers runtime PartyKit runs on — so this
 * same function is shared by src/app/api/sync-token/route.ts and party/index.ts.
 */
export async function syncRoomId(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Claim in the short-lived token minted by /api/sync-token and verified by party/index.ts. */
export interface SyncTokenPayload {
  sub: string;
}

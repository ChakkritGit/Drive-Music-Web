import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { SignJWT } from "jose";
import { authOptions } from "@/lib/auth";
import { syncRoomId } from "@/lib/sync";

const TOKEN_TTL_SECONDS = 5 * 60;

/** Mints a short-lived token proving the caller is signed in as a given Google account, so
 * the PartyKit sync room (party/index.ts) can verify a connection without ever seeing the
 * NextAuth session cookie itself — see src/components/SyncContext.tsx for the client side. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const secret = process.env.PARTY_TOKEN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Sync is not configured" },
      { status: 503 },
    );
  }

  const roomId = await syncRoomId(session.user.email);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(roomId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token, roomId });
}

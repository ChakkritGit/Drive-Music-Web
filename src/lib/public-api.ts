import { Elysia } from "elysia";
import { WebStandardAdapter } from "elysia/adapter/web-standard";
import { SignJWT } from "jose";
import { syncRoomId } from "./sync";

interface ApiDependencies {
  account: () => Promise<string | null | undefined>;
  secret: () => string | undefined;
}

/** NextAuth still verifies the session; Elysia issues the existing short-lived Party Play token. */
export function createPublicApi(deps: ApiDependencies) {
  return new Elysia({ prefix: "/api", adapter: WebStandardAdapter })
    .onError(({ code }) => {
      if (code !== "NOT_FOUND") return Response.json({ error: "Internal server error" }, { status: 500 });
    })
    .get("/healthz", () => Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }))
    .get("/sync-token", async () => {
      const account = await deps.account();
      if (!account) return Response.json({ error: "Not signed in" }, { status: 401 });
      const secret = deps.secret();
      if (!secret) return Response.json({ error: "Sync is not configured" }, { status: 503 });
      const roomId = await syncRoomId(account);
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(roomId)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode(secret));
      return Response.json({ token, roomId });
    });
}

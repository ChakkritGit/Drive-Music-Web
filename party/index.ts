import { Server, routePartykitRequest, type Connection } from "partyserver";
import { jwtVerify } from "jose";
import type { SyncTokenPayload } from "../src/lib/sync";

interface Env {
  PARTY_TOKEN_SECRET: string;
}

/** Cross-device "now playing" mirror — one Durable Object per Google account (room name =
 * SyncTokenPayload.sub, see src/lib/sync.ts for how it's derived). Devices publish their own
 * playback state here; every other connected device gets it relayed so it can show "Playing
 * on {device}" and, if the user wants, pull the same queue/track locally ("Play here" — see
 * SyncContext.tsx). This server only relays and remembers the latest state; it doesn't
 * understand playback itself. */
export class SyncServer extends Server<Env> {
  lastState: string | null = null;

  onConnect(connection: Connection) {
    if (this.lastState) connection.send(this.lastState);
  }

  onMessage(connection: Connection, message: string | ArrayBuffer | ArrayBufferView) {
    if (typeof message !== "string") return;
    this.lastState = message;
    this.broadcast(message, [connection.id]);
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routePartykitRequest(request, env, {
      // Runs before the WebSocket upgrade — rejects anything without a valid, matching token
      // so playback state for this Google account can't be read (or spoofed) by anyone else.
      async onBeforeConnect(req, lobby) {
        const token = new URL(req.url).searchParams.get("token");
        const secret = env.PARTY_TOKEN_SECRET;
        if (!token || !secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { payload } = await jwtVerify<SyncTokenPayload>(token, new TextEncoder().encode(secret));
          if (payload.sub !== lobby.name) {
            return new Response("Unauthorized", { status: 401 });
          }
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
      },
    });
    return response ?? new Response("Not Found", { status: 404 });
  },
};

export default worker;

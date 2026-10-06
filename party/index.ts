import { Server, routePartykitRequest, type Connection } from "partyserver";
import { jwtVerify } from "jose";
import type { SyncTokenPayload } from "../src/lib/sync";
import { LEASE_MS, PARTY_PROTOCOL, positionAt, reducePlayback, validCommand, validPlayback, type PartyRoom } from "../src/lib/party";

interface Env { PARTY_TOKEN_SECRET: string }
type Device = { name: string; seen: number };

/** One serialized, authoritative playback room per authenticated account. */
export class SyncServer extends Server<Env> {
  devices = new Map<string, Device>();
  room: PartyRoom = { type: "room", protocol: PARTY_PROTOCOL, revision: 0, devices: [], outputId: null, pendingOutputId: null, playback: null };
  releasing: { id: string; until: number } | null = null;

  async onStart() {
    const playback = await this.ctx.storage.get<unknown>("playback");
    // A restarted room never resumes speakers without a fresh selection.
    if (validPlayback(playback)) this.room.playback = { ...playback, isPlaying: false, updatedAt: Date.now() };
  }
  onConnect(connection: Connection) { connection.send(JSON.stringify({ ...this.room, serverTime: Date.now() })); }
  async publish() {
    this.room.devices = [...this.devices].map(([id, d]) => ({ id, name: d.name }));
    this.broadcast(JSON.stringify({ ...this.room, serverTime: Date.now() }));
    if (this.room.playback) await this.ctx.storage.put("playback", this.room.playback);
    if (this.devices.size || this.releasing) await this.ctx.storage.setAlarm(Date.now() + 2500);
  }
  async selectOutput(id: string | null) {
    if (id === this.room.outputId && !this.releasing) return;
    if (this.room.playback) this.room.playback = { ...this.room.playback, progress: this.releasing ? this.room.playback.progress : positionAt(this.room.playback, Date.now()), updatedAt: Date.now() };
    if (this.room.outputId) {
      this.releasing = { id: this.room.outputId, until: (this.devices.get(this.room.outputId)?.seen ?? Date.now()) + LEASE_MS };
    }
    this.room.outputId = null;
    this.room.pendingOutputId = id;
    this.room.revision++;
    if (!this.releasing || this.releasing.until <= Date.now()) this.finishHandoff();
    await this.publish();
  }
  finishHandoff() {
    const next = this.room.pendingOutputId;
    this.room.outputId = next && this.devices.has(next) ? next : null;
    this.room.pendingOutputId = null;
    this.releasing = null;
    this.room.revision++;
    if (this.room.playback) this.room.playback = { ...this.room.playback, isPlaying: this.room.outputId ? this.room.playback.isPlaying : false, updatedAt: Date.now() };
  }
  async onMessage(connection: Connection, raw: string | ArrayBuffer | ArrayBufferView) {
    if (typeof raw !== "string" || raw.length > 2_000_000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object") return;
    const now = Date.now();
    if (m.type === "hello" && m.protocol === PARTY_PROTOCOL && typeof m.name === "string") {
      this.devices.set(connection.id, { name: m.name.slice(0, 80), seen: now });
      connection.send(JSON.stringify({ type: "welcome", deviceId: connection.id }));
      await this.publish();
      return;
    }
    const device = this.devices.get(connection.id);
    if (!device) return;
    if (m.type === "heartbeat" && typeof m.sent === "number" && Number.isFinite(m.sent)) {
      device.seen = now;
      // Only the selected output receives a lease. Echo the client's monotonic send time,
      // so delayed packets cannot grant extra audible time or depend on synchronized clocks.
      connection.send(JSON.stringify({ type: "lease", sent: m.sent, revision: this.room.revision, granted: this.room.outputId === connection.id }));
    } else if (m.type === "output" && typeof m.id === "string" && this.devices.has(m.id)) {
      if (!this.room.playback && validPlayback(m.seed)) this.room.playback = { ...m.seed, updatedAt: now };
      await this.selectOutput(m.id);
    } else if (m.type === "released" && this.releasing?.id === connection.id && m.revision === this.room.revision) {
      this.finishHandoff();
      await this.publish();
    } else if (m.type === "command" && validCommand(m.command)) {
      if (!this.room.outputId && !this.room.pendingOutputId) await this.selectOutput(connection.id);
      const base = this.room.playback && this.releasing ? { ...this.room.playback, updatedAt: now } : this.room.playback;
      const playback = reducePlayback(base, m.command, now);
      if (playback === this.room.playback) return;
      this.room.playback = playback;
      this.room.revision++;
      await this.publish();
    } else if (m.type === "report" && connection.id === this.room.outputId && m.revision === this.room.revision && validPlayback(m.playback)) {
      this.room.playback = { ...m.playback, updatedAt: now };
      await this.publish();
    }
  }
  async onClose(connection: Connection) {
    this.devices.delete(connection.id);
    if (this.room.outputId === connection.id) await this.selectOutput(null);
    else await this.publish();
  }
  async onAlarm() {
    const now = Date.now();
    let changed = false;
    for (const [id, device] of this.devices) {
      if (now - device.seen > LEASE_MS) {
        if (this.room.outputId === id) await this.selectOutput(null);
        this.devices.delete(id);
        this.getConnection(id)?.close(4000, "Heartbeat expired");
        changed = true;
      }
    }
    if (this.releasing && now >= this.releasing.until) { this.finishHandoff(); changed = true; }
    if (changed) await this.publish();
    else if (this.devices.size || this.releasing) await this.ctx.storage.setAlarm(now + 2500);
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/health" && ["GET", "HEAD"].includes(request.method)) {
      return Response.json({ status: env.PARTY_TOKEN_SECRET ? "ok" : "degraded", service: "drive-music-sync", protocol: PARTY_PROTOCOL },
        { status: env.PARTY_TOKEN_SECRET ? 200 : 503, headers: { "Cache-Control": "no-store" } });
    }
    const response = await routePartykitRequest(request, env, {
      async onBeforeConnect(req, lobby) {
        const token = new URL(req.url).searchParams.get("token");
        if (!token || !env.PARTY_TOKEN_SECRET) return new Response("Unauthorized", { status: 401 });
        try {
          const { payload } = await jwtVerify<SyncTokenPayload>(token, new TextEncoder().encode(env.PARTY_TOKEN_SECRET), { algorithms: ["HS256"] });
          if (payload.sub !== lobby.name) return new Response("Unauthorized", { status: 401 });
        } catch { return new Response("Unauthorized", { status: 401 }); }
      },
    });
    return response ?? new Response("Not Found", { status: 404 });
  },
};

export default worker;

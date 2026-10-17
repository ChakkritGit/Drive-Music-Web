import { describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { createPublicApi } from "./public-api";
import { syncRoomId } from "./sync";

describe("sync token API", () => {
  it("requires a verified session before checking the signing secret", async () => {
    const app = createPublicApi({ account: async () => null, secret: () => { throw new Error("must not read secret"); } });
    const response = await app.fetch(new Request("http://localhost/api/sync-token"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not signed in" });
  });

  it("reports an unconfigured sync service without issuing a token", async () => {
    const app = createPublicApi({ account: async () => "synthetic-account", secret: () => undefined });
    const response = await app.fetch(new Request("http://localhost/api/sync-token"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Sync is not configured" });
  });

  it("preserves the five-minute HS256 token and hashed room id", async () => {
    const secret = "test-only-signing-secret-with-at-least-32-characters";
    const app = createPublicApi({ account: async () => "synthetic-account", secret: () => secret });
    const response = await app.fetch(new Request("http://localhost/api/sync-token"));
    expect(response.status).toBe(200);
    const { token, roomId } = await response.json();
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    expect(protectedHeader.alg).toBe("HS256");
    expect(roomId).toBe(await syncRoomId("synthetic-account"));
    expect(payload.sub).toBe(roomId);
    expect(payload.exp! - payload.iat!).toBe(300);
    expect(payload).not.toHaveProperty("email");
  });

  it("keeps liveness independent of sessions and token signing", async () => {
    const app = createPublicApi({ account: async () => { throw new Error("must not call auth"); }, secret: () => undefined });
    const response = await app.fetch(new Request("http://localhost/api/healthz"));
    expect(await response.json()).toEqual({ ok: true });
    const head = await app.fetch(new Request("http://localhost/api/healthz", { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("does not expose session verification failures", async () => {
    const app = createPublicApi({ account: async () => { throw new Error("private auth detail"); }, secret: () => undefined });
    const response = await app.fetch(new Request("http://localhost/api/sync-token"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});

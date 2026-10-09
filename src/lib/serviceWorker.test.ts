import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://drive-music.test";
const CACHE = "drive-music-shell-v3";
const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function asRequest(input: Request | string): Request {
  return typeof input === "string" ? new Request(new URL(input, ORIGIN)) : input;
}

class MemoryCache {
  private entries = new Map<string, { request: Request; response: Response }>();
  async match(input: Request | string) {
    const request = asRequest(input);
    const entry = this.entries.get(request.url);
    if (!entry) return undefined;
    const vary = (entry.response.headers.get("vary") || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (vary.some((header) => entry.request.headers.get(header) !== request.headers.get(header))) return undefined;
    return entry.response.clone();
  }
  async put(input: Request | string, response: Response) {
    const request = asRequest(input);
    this.entries.set(request.url, { request: request.clone(), response: response.clone() });
  }
  async keys() { return Array.from(this.entries.values(), ({ request }) => request.clone()); }
  async delete(input: Request | string) { return this.entries.delete(asRequest(input).url); }
}

interface WorkerEvent {
  request?: Request;
  data?: { type: string };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
}

function worker(options: { hostname?: string; existing?: Map<string, MemoryCache> } = {}) {
  const stores = options.existing || new Map<string, MemoryCache>();
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const postMessage = vi.fn();
  const fetch = vi.fn<typeof globalThis.fetch>();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name)!;
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => stores.delete(name),
  };
  vm.runInNewContext(source, {
    self: {
      location: new URL(`https://${options.hostname || "drive-music.test"}`),
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) => handlers.set(type, handler),
      skipWaiting: vi.fn(),
      registration: { unregister: vi.fn() },
      clients: { claim: vi.fn(), matchAll: async () => [{ postMessage, url: ORIGIN, navigate: vi.fn() }] },
    },
    caches, fetch, Request, Response, URL, Headers, crypto: webcrypto, TextEncoder, AbortController, setTimeout, clearTimeout,
  });
  return {
    fetch, stores, caches, postMessage,
    async dispatch(type: string, request?: Request, data?: { type: string }) {
      const pending: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      handlers.get(type)?.({ request, data, waitUntil: (promise) => pending.push(promise), respondWith: (promise) => { response = promise; } });
      // Keep rejection handled while asserting rejected network responses separately.
      const result = response?.then((value) => ({ value }), (error: unknown) => ({ error }));
      await Promise.all(pending);
      return result ? await result : undefined;
    },
  };
}

function navigation(path: string) {
  const request = new Request(new URL(path, ORIGIN));
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
}

function html(body: string) {
  return new Response(body, { headers: { "content-type": "text/html" } });
}

function flight(body: string) {
  return new Response(body, { headers: { "content-type": "text/x-component", vary: "RSC, Next-Router-State-Tree, Next-Router-Prefetch" } });
}

function routerRequest(marker: string, tree = "library", prefetch?: string) {
  return new Request(`${ORIGIN}/library?_rsc=${marker}`, {
    headers: { RSC: "1", "Next-Router-State-Tree": tree, ...(prefetch ? { "Next-Router-Prefetch": prefetch } : {}) },
  });
}

async function response(result: Awaited<ReturnType<ReturnType<typeof worker>["dispatch"]>>) {
  if (!result || !("value" in result)) throw new Error("No worker response");
  return result.value;
}

describe("offline service worker", () => {
  it("warms library HTML and its critical chunks before the first controlled navigation", async () => {
    const sw = worker();
    sw.fetch.mockImplementation(async (input, options) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(options?.credentials).toBe("omit");
      if (url === `${ORIGIN}/`) return html('<script src="/_next/static/root.js"></script>');
      if (url === `${ORIGIN}/library`) return html('<link href="/_next/static/library.css" rel="stylesheet"><script src="/_next/static/library.js"></script><img src="/icon-512.png">');
      return new Response("asset");
    });
    await sw.dispatch("install");
    sw.fetch.mockRejectedValue(new TypeError("offline"));
    const result = await response(await sw.dispatch("fetch", navigation("/library")));
    expect(await result.text()).toContain("library.js");
    const chunk = await response(await sw.dispatch("fetch", new Request(`${ORIGIN}/_next/static/library.js`)));
    expect(await chunk.text()).toBe("asset");
    const icon = await response(await sw.dispatch("fetch", new Request(`${ORIGIN}/icon-512.png`)));
    expect(await icon.text()).toBe("asset");
    expect(sw.postMessage).toHaveBeenCalledWith({ type: "drive-music-connectivity", online: false });
  });

  it("does not replace a working page with HTML whose new chunks failed to load", async () => {
    const sw = worker();
    const cache = await sw.caches.open(CACHE);
    await cache.put(`${ORIGIN}/library`, html("working library"));
    sw.fetch.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/_next/static/")) throw new TypeError("slow update failed");
      return html('<script src="/_next/static/new.js"></script>');
    });
    await sw.dispatch("install");
    expect(await (await cache.match(`${ORIGIN}/library`))!.text()).toBe("working library");
  });

  it("retries shell warming after an offline install when the app opens with a connection", async () => {
    const sw = worker();
    sw.fetch.mockRejectedValue(new TypeError("offline"));
    await sw.dispatch("install");
    sw.fetch.mockResolvedValue(html("available library"));
    await sw.dispatch("message", undefined, { type: "drive-music-warm-offline" });
    sw.fetch.mockRejectedValue(new TypeError("offline again"));
    const cached = await response(await sw.dispatch("fetch", navigation("/library")));
    expect(await cached.text()).toBe("available library");
  });

  it("migrates prior working pages and chunks without deleting unrelated caches or copying API responses", async () => {
    const previous = new MemoryCache();
    const unrelated = new MemoryCache();
    await previous.put(`${ORIGIN}/library`, html("previous library"));
    await previous.put(`${ORIGIN}/_next/static/previous.js`, new Response("previous chunk"));
    await previous.put(`${ORIGIN}/api/auth/session`, new Response("secret"));
    await previous.put(`${ORIGIN}/admin`, html("admin"));
    const sw = worker({ existing: new Map([["drive-music-shell-v2", previous], ["another-app-cache", unrelated]]) });
    await sw.dispatch("activate");
    const cache = await sw.caches.open(CACHE);
    expect(await (await cache.match(`${ORIGIN}/library`))!.text()).toBe("previous library");
    expect(await (await cache.match(`${ORIGIN}/_next/static/previous.js`))!.text()).toBe("previous chunk");
    expect(await cache.match(`${ORIGIN}/api/auth/session`)).toBeUndefined();
    expect(await cache.match(`${ORIGIN}/admin`)).toBeUndefined();
    expect(sw.stores.has("another-app-cache")).toBe(true);
    expect(sw.stores.has("drive-music-shell-v2")).toBe(false);
  });

  it("reuses the same router variant offline despite a changed _rsc marker", async () => {
    const sw = worker();
    sw.fetch.mockResolvedValue(flight("library flight"));
    await sw.dispatch("fetch", routerRequest("online"));
    sw.fetch.mockRejectedValue(new TypeError("offline"));
    const cached = await response(await sw.dispatch("fetch", routerRequest("new-marker")));
    expect(await cached.text()).toBe("library flight");
    const page = await sw.caches.open(CACHE);
    expect(await page.match(`${ORIGIN}/library`)).toBeUndefined();
  });

  it("does not replay a Flight response into another router tree or prefetch mode", async () => {
    const sw = worker();
    sw.fetch.mockResolvedValue(flight("tree A"));
    await sw.dispatch("fetch", routerRequest("a", "tree-A", "1"));
    sw.fetch.mockRejectedValue(new TypeError("offline"));
    const changedTree = await response(await sw.dispatch("fetch", routerRequest("b", "tree-B", "1")));
    const changedMode = await response(await sw.dispatch("fetch", routerRequest("c", "tree-A")));
    expect(changedTree.type).toBe("error");
    expect(changedMode.type).toBe("error");
  });

  it("observes failed and successful live session requests without caching or masking them", async () => {
    const sw = worker();
    const request = new Request(`${ORIGIN}/api/auth/session`);
    const failure = new TypeError("offline");
    sw.fetch.mockRejectedValue(failure);
    expect(await sw.dispatch("fetch", request)).toEqual({ error: failure });
    expect(sw.postMessage).toHaveBeenLastCalledWith({ type: "drive-music-connectivity", online: false });
    sw.fetch.mockResolvedValue(new Response("null", { headers: { "content-type": "application/json" } }));
    expect(await (await response(await sw.dispatch("fetch", request))).text()).toBe("null");
    expect(sw.postMessage).toHaveBeenLastCalledWith({ type: "drive-music-connectivity", online: true });
    expect(await (await sw.caches.open(CACHE)).keys()).toEqual([]);
  });

  it("does not repeatedly warm a complete shell on session polling", async () => {
    const sw = worker();
    const cache = await sw.caches.open(CACHE);
    await cache.put(`${ORIGIN}/`, html("home"));
    await cache.put(`${ORIGIN}/library`, html("library"));
    sw.fetch.mockResolvedValue(new Response("null"));
    await sw.dispatch("fetch", new Request(`${ORIGIN}/api/auth/session`));
    expect(sw.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps server session errors live while signaling that local offline access is available", async () => {
    const sw = worker();
    sw.fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
    const result = await response(await sw.dispatch("fetch", new Request(`${ORIGIN}/api/auth/session`)));
    expect(result.status).toBe(503);
    expect(sw.postMessage).toHaveBeenLastCalledWith({ type: "drive-music-connectivity", online: false });
    expect(sw.stores.size).toBe(0);
  });

  it("serves the cached library when the shell server is unavailable", async () => {
    const sw = worker();
    const cache = await sw.caches.open(CACHE);
    await cache.put(`${ORIGIN}/library`, html("available offline"));
    sw.fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
    const result = await response(await sw.dispatch("fetch", navigation("/library")));
    expect(await result.text()).toBe("available offline");
    expect(sw.postMessage).toHaveBeenLastCalledWith({ type: "drive-music-connectivity", online: false });
  });

  it("aborts a hanging shell request and opens the cached library within four seconds", async () => {
    vi.useFakeTimers();
    try {
      const sw = worker();
      const cache = await sw.caches.open(CACHE);
      await cache.put(`${ORIGIN}/library`, html("cached during slow connection"));
      sw.fetch.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));
      const pending = sw.dispatch("fetch", navigation("/library"));
      await vi.advanceTimersByTimeAsync(4000);
      const result = await response(await pending);
      expect(await result.text()).toBe("cached during slow connection");
      expect(sw.postMessage).toHaveBeenLastCalledWith({ type: "drive-music-connectivity", online: false });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves auth APIs, admin pages and cross-origin requests to the network", async () => {
    const sw = worker();
    for (const url of [`${ORIGIN}/api/sync-token`, `${ORIGIN}/api/auth/callback/google`, `${ORIGIN}/admin`, "https://drive.google.com/song.mp3"]) {
      expect(await sw.dispatch("fetch", new Request(url))).toBeUndefined();
    }
    expect(sw.fetch).not.toHaveBeenCalled();
    expect(sw.stores.size).toBe(0);
  });

  it("does not cache a private or no-store response even from an app shell route", async () => {
    const sw = worker();
    for (const policy of ["private, max-age=0", "no-store"]) {
      sw.fetch.mockResolvedValue(new Response("account", { headers: { "content-type": "text/html", "cache-control": policy } }));
      await sw.dispatch("fetch", navigation("/library"));
    }
    const cache = await sw.caches.open(CACHE);
    expect(await cache.match(`${ORIGIN}/library`)).toBeUndefined();
  });

  it("redirects an unvisited offline app route to the warmed library page", async () => {
    const sw = worker();
    const cache = await sw.caches.open(CACHE);
    await cache.put(`${ORIGIN}/library`, html("library"));
    sw.fetch.mockRejectedValue(new TypeError("offline"));
    const result = await response(await sw.dispatch("fetch", navigation("/browse")));
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe(`${ORIGIN}/library`);
  });
});

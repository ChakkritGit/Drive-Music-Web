const CACHE_NAME = "drive-music-shell-v3";
const CACHE_PREFIX = "drive-music-shell-";
const MAX_STATIC_ENTRIES = 300;
const MAX_ROUTE_ENTRIES = 60;
const SHELL_NETWORK_TIMEOUT_MS = 4000;
const OFFLINE_SHELLS = ["/", "/library"];
const ROUTER_HEADERS = [
  "rsc", "next-router-state-tree", "next-router-prefetch",
  "next-router-segment-prefetch", "next-url", "accept",
];

// On the old host this worker exists only to retire itself: it unregisters, drops its caches,
// and sends every open window to the same page on the new domain.
const OLD_HOST = "drive-music-taupe.vercel.app";
const NEW_ORIGIN = "https://drive-music.chakkritton.com";
let shellWarmPromise = null;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (self.location.hostname !== OLD_HOST) event.waitUntil(scheduleShellWarm());
});

self.addEventListener("message", (event) => {
  if (self.location.hostname !== OLD_HOST && event.data?.type === "drive-music-warm-offline") {
    event.waitUntil(scheduleShellWarm());
  }
});

self.addEventListener("activate", (event) => {
  if (self.location.hostname === OLD_HOST) {
    event.waitUntil(
      (async () => {
        await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
        await self.registration.unregister();
        const windows = await self.clients.matchAll({ type: "window" });
        await Promise.all(windows.map((w) => w.navigate(NEW_ORIGIN + new URL(w.url).pathname)));
      })(),
    );
    return;
  }
  event.waitUntil(
    (async () => {
      // Keep the previous HTML and its hashed chunks together until a newer copy is cached.
      // Deleting the old cache during activation used to break the next offline reload.
      const cache = await caches.open(CACHE_NAME);
      const oldNames = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
      for (const name of oldNames) {
        const previous = await caches.open(name);
        for (const request of await previous.keys()) {
          const url = new URL(request.url);
          if (url.origin !== self.location.origin || !isShellOrAsset(url)) continue;
          if (await cache.match(request)) continue;
          const response = await previous.match(request);
          if (response && isCacheable(response)) await cache.put(request, response);
        }
        await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (self.location.hostname === OLD_HOST) return;
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Observe connectivity without saving a session, token, or other API response. A genuine
  // signed-out response remains a genuine signed-out response in the live SessionProvider.
  if (url.pathname === "/api/auth/session") {
    const network = fetch(request);
    event.respondWith(network);
    event.waitUntil(network.then(
      async (response) => {
        await reportConnectivity(response.status < 500);
        if (response.status >= 500) return;
        const cache = await caches.open(CACHE_NAME);
        const shells = await Promise.all(OFFLINE_SHELLS.map((path) => cache.match(new URL(path, self.location.origin).href)));
        if (shells.some((shell) => !shell)) await scheduleShellWarm();
      },
      () => reportConnectivity(false),
    ));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (isCacheable(response)) {
          await cache.put(request, response.clone()).catch(() => {});
          await trimCache(cache, true);
        }
        return response;
      }),
    );
    return;
  }

  const isRouterRequest = ROUTER_HEADERS.slice(0, 4).some((header) => request.headers.has(header)) || url.searchParams.has("_rsc");
  if (isAppShell(url.pathname) && (request.mode === "navigate" || isRouterRequest)) {
    event.respondWith(serveShell(request, isRouterRequest));
    return;
  }

  // Only public same-origin assets belong in the shell cache. Drive files already live in
  // IndexedDB; admin pages, authentication and arbitrary dynamic URLs always use the network.
  if (isPublicAsset(url.pathname)) {
    const response = caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const network = await fetch(request);
      if (isCacheable(network)) await cache.put(request, network.clone()).catch(() => {});
      return network;
    });
    event.respondWith(response);
  }
});

function isAppShell(pathname) {
  return ["/", "/library", "/browse", "/playlists", "/settings"].includes(pathname) ||
    /^\/playlists\/[^/]+$/.test(pathname) || /^\/settings\/[a-z-]+$/.test(pathname);
}

function isPublicAsset(pathname) {
  return ["/manifest.webmanifest", "/icon.svg", "/icon.png", "/icon-192.png", "/icon-512.png", "/apple-icon.png", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/favicon.ico"].includes(pathname);
}

function isShellOrAsset(url) {
  return isAppShell(url.pathname) || isPublicAsset(url.pathname) || url.pathname.startsWith("/_next/static/");
}

function isCacheable(response) {
  return response.ok && response.type !== "opaque" && !response.redirected &&
    !/(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get("cache-control") || "");
}

async function reportConnectivity(online) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const window of windows) window.postMessage({ type: "drive-music-connectivity", online });
}

async function routerCacheKey(request) {
  const url = new URL(request.url);
  url.searchParams.delete("_rsc");
  // Next's router tree and prefetch mode determine the Flight response. Hash their values
  // rather than replaying a cached response into a different tree or persisting them in URLs.
  const variant = ROUTER_HEADERS.map((header) => [header, request.headers.get(header)]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(variant)));
  url.searchParams.set("_dm_router", Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""));
  return new Request(url.href);
}

async function serveShell(request, isRouterRequest) {
  const cache = await caches.open(CACHE_NAME);
  const key = isRouterRequest ? await routerCacheKey(request) : request.url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SHELL_NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.status >= 500) throw new Error("App shell unavailable");
    const contentType = response.headers.get("content-type") || "";
    if (isCacheable(response) && contentType.includes(isRouterRequest ? "text/x-component" : "text/html")) {
      await cache.put(key, response.clone()).catch(() => {});
      await trimCache(cache, false);
    }
    return response;
  } catch {
    await reportConnectivity(false);
    const cached = await cache.match(key);
    if (cached) return cached;
    // Next handles a failed Flight request by doing a full navigation; the warm HTML shell
    // then loads without needing a router payload from the network.
    if (isRouterRequest) return Response.error();
    if (await cache.match(new URL("/library", self.location.origin).href)) {
      return Response.redirect(new URL("/library", self.location.origin).href, 302);
    }
    return (await cache.match(new URL("/", self.location.origin).href)) || Response.error();
  } finally {
    clearTimeout(timeout);
  }
}

async function warmOfflineShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(OFFLINE_SHELLS.map(async (path) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      // These pages render a public client shell; credentials are intentionally omitted.
      const url = new URL(path, self.location.origin).href;
      const response = await fetch(url, { credentials: "omit", headers: { Accept: "text/html" }, signal: controller.signal });
      if (!isCacheable(response) || !(response.headers.get("content-type") || "").includes("text/html")) return;
      const html = await response.clone().text();
      const assets = new Set();
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const asset = new URL(match[1].replaceAll("&amp;", "&"), self.location.origin);
        if (asset.origin === self.location.origin && (asset.pathname.startsWith("/_next/static/") || isPublicAsset(asset.pathname))) assets.add(asset.href);
      }
      // Publish the HTML only after its critical chunks are available. A failed update
      // therefore leaves the previous working offline page intact.
      await Promise.all(Array.from(assets, async (asset) => {
        if (await cache.match(asset)) return;
        const assetResponse = await fetch(asset, { credentials: "omit", signal: controller.signal });
        if (!isCacheable(assetResponse)) throw new Error("Shell asset unavailable");
        await cache.put(asset, assetResponse);
      }));
      await cache.put(url, response);
    } catch {
      // Registration remains usable when offline, or when storage/network warming fails.
    } finally {
      clearTimeout(timeout);
    }
  }));
}

function scheduleShellWarm() {
  if (!shellWarmPromise) {
    shellWarmPromise = warmOfflineShell().catch(() => {}).finally(() => { shellWarmPromise = null; });
  }
  return shellWarmPromise;
}

async function trimCache(cache, staticOnly) {
  const keys = (await cache.keys()).filter((request) => {
    const url = new URL(request.url);
    return staticOnly ? url.pathname.startsWith("/_next/static/") :
      isAppShell(url.pathname) && !OFFLINE_SHELLS.some((path) => url.pathname === path && !url.searchParams.has("_dm_router"));
  });
  const limit = staticOnly ? MAX_STATIC_ENTRIES : MAX_ROUTE_ENTRIES;
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((request) => cache.delete(request)));
}

const CACHE_NAME = "drive-music-shell-v2";
const MAX_STATIC_ENTRIES = 300;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Auth/session endpoints must always hit the network fresh, and audio playback already reads
// from IndexedDB, not this cache. Strategy per request type is noted at each branch.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // RSC and prefetch payloads go straight to the network: cached ones go stale after a deploy.
  if (
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc")
  ) {
    return;
  }

  // Hashed, immutable build files: cache first, fetch and keep on a miss.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          await trimStatic(cache);
        }
        return response;
      }),
    );
    return;
  }

  // Pages: network first so a deploy shows up at once; the cached copy is the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request.url, response.clone());
          return response;
        } catch {
          return (await cache.match(request.url)) || (await cache.match("/")) || Response.error();
        }
      }),
    );
    return;
  }

  // Everything else (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || networkFetch;
    }),
  );
});

// ponytail: bounded by entry count, not bytes. cache.keys() is in insertion order, so the
// oldest go first; weigh the bodies if a few huge chunks ever matter.
async function trimStatic(cache) {
  const keys = (await cache.keys()).filter((req) => new URL(req.url).pathname.startsWith("/_next/static/"));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES)).map((req) => cache.delete(req)));
}

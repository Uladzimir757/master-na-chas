// PWA service worker. Placeholder-brand build — bump CACHE_VERSION whenever
// this file or APP_SHELL changes, so returning visitors drop the old cache
// instead of running stale logic forever.
const CACHE_VERSION = "zr-v1";
const APP_SHELL = [
  "/",
  "/cabinet/",
  "/admin/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // Best-effort precache — a slow/offline first install must not
        // block activation.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only same-origin GET requests are ours to cache. The API lives on a
  // different Render service (a different origin) and every mutation
  // (bookings, auth, admin actions) must always hit the network — caching
  // any of that here would be a real bug, not an optimization.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      // Stale-while-revalidate: an existing cache entry is served
      // immediately (instant repeat loads, works with a flaky/offline
      // connection), while a fresh copy is fetched in the background for
      // next time.
      return cached || network;
    })
  );
});

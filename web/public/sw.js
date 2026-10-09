// PWA service worker. Placeholder-brand build — bump CACHE_VERSION whenever
// this file or APP_SHELL changes, so returning visitors drop the old cache
// instead of running stale logic forever.
const CACHE_VERSION = "zr-v2";
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
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// HTML pages: network first. With stale-while-revalidate (the first version
// of this worker) an installed app opened the *previous* deploy's page and
// only showed the new one on the next open — a fix shipped to the site
// looked "not deployed". The cache is now only the offline fallback.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      Response.error()
    );
  }
}

// /_next/static/* file names carry a content hash — a given URL never changes,
// so serving it from the cache without asking the network is always correct.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// Everything else same-origin (icons, manifest, fonts): serve what we have
// right away, refresh it in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only same-origin GET requests are ours to cache. The API lives on a
  // different Render service (a different origin) and every mutation
  // (bookings, auth, admin actions) must always hit the network — caching
  // any of that here would be a real bug, not an optimization.
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

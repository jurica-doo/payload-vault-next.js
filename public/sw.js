/* Service worker for Payload Vault.
 *
 * Registered as `/sw.js?v=<buildId>` — the version lives in the URL, so every
 * deploy produces a new registration and the browser installs a new worker.
 * The new worker parks in `waiting` (no skipWaiting on install) until the user
 * presses "Jetzt aktualisieren" in the in-app update bar, which sends
 * SKIP_WAITING.
 *
 * Caching strategy:
 *  - /_next/static, /_next/image  -> cache-first (content-hashed, immutable)
 *  - same-origin images/fonts     -> stale-while-revalidate
 *  - navigations                  -> network-first, cached page, then /offline
 *  - cross-origin (supabase, googleapis) + non-GET -> untouched (signed URLs
 *    and auth responses must never be cached)
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";

const STATIC_CACHE = `pv-static-${VERSION}`;
const PAGE_CACHE = `pv-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/profinaLogo.svg",
  "/profinaLogoLight.svg",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const putInCache = (cacheName, request, response) => {
  const copy = response.clone();
  caches
    .open(cacheName)
    .then((cache) => cache.put(request, copy))
    .catch(() => undefined);
};

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) putInCache(STATIC_CACHE, request, response);
  return response;
};

const staleWhileRevalidate = async (request) => {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) putInCache(STATIC_CACHE, request, response);
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
};

const networkFirstNavigation = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) putInCache(PAGE_CACHE, request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests (supabase auth/storage signed URLs,
  // googleapis) — let the network handle them untouched.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Content-hashed build assets: safe to cache per version.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

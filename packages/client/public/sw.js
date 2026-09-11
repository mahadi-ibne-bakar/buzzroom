/*
 * Service worker for the installed app.
 *
 * A buzzer is useless without a connection, so this deliberately does not try
 * to make the game work offline. Its job is narrower: cache the app shell so
 * launching from the home screen is instant rather than a cold network fetch,
 * and show the app (which knows how to say "Reconnecting…") instead of the
 * browser's error page when the network drops.
 *
 * Navigations are network-first so a deploy is picked up on the next launch;
 * a stale-first shell would leave players on an old build until they cleared
 * site data, which nobody at a game night is going to do.
 */

const CACHE = "buzzroom-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // Don't block activation on a failed precache -- a missing entry
      // shouldn't leave the app with no worker at all.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GETs are cacheable, and the socket connection must never be touched.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/socket.io/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Static assets: serve from cache when present, otherwise fetch and keep a
  // copy. Vite fingerprints these filenames, so a cached entry is never stale
  // for a name that is still in use.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

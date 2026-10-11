/* Service worker do app Rebanho.
 * - Estáticos do Next (/_next/static): cache-first (são imutáveis).
 * - Páginas (navegação): network-first, com cópia em cache para abrir sem sinal.
 * - Lista de brincos (/api/animals/tags): network-first com fallback.
 * - Envios (POST/PATCH/DELETE) NÃO passam pelo cache: a fila offline fica no app (IndexedDB).
 */
const VERSION = "v1";
const STATIC = `ovinos-static-${VERSION}`;
const PAGES = `ovinos-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (url.pathname === "/api/animals/tags") {
    event.respondWith(networkFirst(req, PAGES));
    return;
  }

  if (req.mode === "navigate") {
    if (url.pathname.startsWith("/api/") || url.pathname === "/login" || url.pathname === "/setup") return;
    event.respondWith(
      networkFirst(req, PAGES).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected) {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copy));
    }
    return res;
  } catch (e) {
    const hit = await caches.match(req, { ignoreSearch: false });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") caches.delete(PAGES);
});

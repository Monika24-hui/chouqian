// Minimal service worker for offline shell caching
const CACHE = "asakusa-omikuji-pwa-v2";
const ASSETS = ["./", "./index.html", "./app.js", "./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

// Cache-first for app shell; network-first for everything else
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (ASSETS.some(a => url.pathname.endsWith(a.replace("./","")) || url.pathname === "/")) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const fresh = await fetch(req);
      c.put(req, fresh.clone());
      return fresh;
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      return fresh;
    } catch {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      return hit || Response.error();
    }
  })());
});

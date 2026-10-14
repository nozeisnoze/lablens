const CACHE = "lablens-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k.startsWith("lablens-") && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);
// Cache only application assets. Never cache camera frames, label data, or CSV.
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (event.request.method !== "GET" || u.origin !== self.location.origin)
    return;
  if (
    !["/", "/index.html", "/manifest.webmanifest", "/icon.svg"].includes(
      u.pathname,
    ) &&
    !u.pathname.startsWith("/assets/") &&
    !u.pathname.startsWith("/ocr/")
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        throw error;
      }
    })(),
  );
});

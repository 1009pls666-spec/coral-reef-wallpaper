const CACHE_NAME = "coral-reef-mobile-v18";
const APP_ROOT = new URL("./", self.location.href).pathname;
const appPath = (path) => new URL(path.replace(/^\//, ""), self.location.href).pathname;
const APP_SHELL = [
  APP_ROOT,
  appPath("manifest.webmanifest"),
  appPath("reef-icon-192.png"),
  appPath("reef-icon-512.png"),
  appPath("reef/assets/bg/reef-mobile.png"),
  appPath("reef/assets/manifest.json")
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(APP_ROOT, copy));
          return response;
        })
        .catch(() => caches.match(APP_ROOT))
    );
    return;
  }

  const networkFirst = ["script", "style", "worker"].includes(event.request.destination);
  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});

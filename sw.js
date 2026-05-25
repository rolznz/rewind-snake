/* ── Service Worker — Rewind Snake PWA ── */
const CACHE_NAME = 'rewind-snake-v2';

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      './',
      './index.html',
      './game.js',
      './highscore.js',
      './manifest.json',
      './icon-192.png',
      './icon-512.png'
    ]))
  );
  self.skipWaiting();
});

// Activate: clean old caches + claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for HTML and JS (so updates are always fetched)
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Clone the network response to cache it
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
  }
  // Cache-first for static assets (icons, manifest)
  else {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).catch(() => {
          if (event.request.destination === 'document') {
            return caches.match('./');
          }
        });
      })
    );
  }
});

// Message handler: tell waiting clients to reload
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.clients.claim();
  }
});

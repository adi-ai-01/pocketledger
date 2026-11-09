// PocketLedger PWA Service Worker
const CACHE_NAME = 'pocketledger-shell-v2';
const RUNTIME_FONT_CACHE = 'pocketledger-fonts-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== RUNTIME_FONT_CACHE) {
            return caches.delete(key);
          }
          return null;
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never intercept non-GET requests or external payment schemes (e.g. upi://)
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http://') && !req.url.startsWith('https://')) return;

  const url = new URL(req.url);

  // 1. Navigation requests: Network-first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 2. Google Fonts: Stale-while-revalidate / cache-first for offline typography
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(RUNTIME_FONT_CACHE).then((fontCache) => {
        return fontCache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              fontCache.put(req, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => caches.match(req));
        });
      })
    );
    return;
  }

  // 3. Same-origin assets: Cache-first, with network fetch and dynamic caching
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((response) => {
          if (response && response.status === 200) {
            const respClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Default: Network fetch
  event.respondWith(fetch(req));
});

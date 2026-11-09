import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function pwaPlugin() {
  return {
    name: 'pocketledger-pwa-sw',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist');
      const assetsDir = path.resolve(distDir, 'assets');

      const precacheList = [
        '/',
        '/index.html',
        '/manifest.json',
        '/icon.svg',
        '/icon-192.png',
        '/icon-512.png',
      ];

      if (fs.existsSync(assetsDir)) {
        const assetFiles = fs.readdirSync(assetsDir);
        for (const file of assetFiles) {
          if (file.endsWith('.js') || file.endsWith('.css')) {
            precacheList.push(`/assets/${file}`);
          }
        }
      }

      // Generate build-timestamp cache name
      const buildVersion = Date.now().toString(36);
      const cacheName = `pocketledger-v2-${buildVersion}`;

      const swContent = `// PocketLedger PWA Service Worker (Auto-generated on production build)
const CACHE_NAME = '${cacheName}';
const RUNTIME_FONT_CACHE = 'pocketledger-fonts-v1';

const PRECACHE_ASSETS = ${JSON.stringify(precacheList, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
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

  // 2. Google Fonts: Cache-first with background cache
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(RUNTIME_FONT_CACHE).then((fontCache) => {
        return fontCache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((response) => {
            if (response && response.status === 200) {
              fontCache.put(req, response.clone());
            }
            return response;
          }).catch(() => caches.match(req));
        });
      })
    );
    return;
  }

  // 3. Same-origin assets: Cache-first, with fallback to network and dynamic caching
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default: Network fetch
  event.respondWith(fetch(req));
});
`;

      const swDest = path.resolve(distDir, 'sw.js');
      fs.writeFileSync(swDest, swContent, 'utf-8');
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pwaPlugin(),
  ],
  server: {
    host: true,
    port: 5173,
  },
});

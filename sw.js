/* ════════════════════════════════════
   QuarryBook – Service Worker
   Caches app shell for offline use
════════════════════════════════════ */

const CACHE_NAME = 'quarrybook-v1';

// Files to cache for offline use
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  // Fonts
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap',
  // CDN scripts
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.6.0/dist/jspdf.plugin.autotable.min.js',
];

// ── Install: cache app shell ──────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for shell, network-first for Firestore ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to network for Firestore / Firebase API calls
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for everything else (app shell, fonts, CDN)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache valid GET responses
        if (e.request.method === 'GET' && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

const CACHE = 'quarrybook-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate — clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network-first for app shell, cache-first fallback for offline
self.addEventListener('fetch', e => {
  // Don't cache Firebase / Google API calls
  if (e.request.url.includes('firestore') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('gstatic')) {
    return;
  }

  const isAppShell = ASSETS.some(a => e.request.url.endsWith(a)) || e.request.mode === 'navigate';

  if (isAppShell) {
    // Network-first: always try to get the latest version
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first for other static assets (images, fonts, etc.)
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
  }
});

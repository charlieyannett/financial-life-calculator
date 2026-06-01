/* Service worker for the Financial Life Calculator PWA.
   Strategy:
   - Navigations (HTML): network-first, fall back to cached shell offline.
     Keeps the served HTML fresh so it always references the latest
     ?v= versioned CSS/JS.
   - Same-origin static assets: cache-first by EXACT url (no ignoreSearch),
     so bumping ?v=N busts the cache naturally. Misses are fetched + cached.
   - Cross-origin deps (fonts, Chart.js): cache-first.
   Bump CACHE_VERSION (and the ?v= query + precache entries) on each deploy. */

const CACHE_VERSION = 'flc-v5';

// Exact URLs the page requests, so cached entries match what's fetched.
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css?v=2',
  './app.js?v=3',
  './manifest.json',
  './logo.png',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  // Cross-origin deps so charts/fonts work even on the very first offline load.
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap',
];

const RUNTIME_HOSTS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isRuntimeHost = RUNTIME_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isRuntimeHost) return;

  // HTML navigations: network-first, cache fallback for offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.open(CACHE_VERSION).then(c =>
          c.match('./index.html', { ignoreSearch: true }).then(r => r || c.match('./'))
        ))
    );
    return;
  }

  if (sameOrigin) {
    // Versioned static assets: cache-first by exact URL.
    event.respondWith(
      caches.open(CACHE_VERSION).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Cross-origin (fonts, Chart.js): cache-first, then network, then cache it.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return cached || Response.error();
      }
    })
  );
});

// Derive a per-tenant cache key from the hostname so that each teacher
// subdomain gets its own isolated cache. This allows a student to install
// the PWA from multiple teacher subdomains on the same device without
// cache conflicts (e.g. teacher1.wathba.site and teacher2.wathba.site).
const _hostname = self.location.hostname;
const _subdomain = _hostname.split('.')[0] || 'default';
const CACHE_NAME = `wathba-${_subdomain}-v2`;

// NOTE: '/' (the HTML shell) is intentionally NOT cache-first — see the fetch
// handler below. Caching index.html cache-first meant browsers kept serving a
// stale shell (pointing at old hashed JS bundles) forever after every deploy,
// no matter how many code fixes shipped. manifest.json is excluded for the
// same reason (non-hashed, can change independently). Only truly immutable
// assets are safe to cache-first.
const STATIC_ASSETS = [
  '/favicon.png',
  '/wathba-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Precache '/' too so a fresh install has an offline fallback available
      // immediately; the fetch handler below still always prefers the network
      // for navigations and keeps this entry fresh on every successful load.
      cache.addAll([...STATIC_ASSETS, '/'])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k.startsWith('wathba-'))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // HTML navigations (the app shell) must always be network-first: it
  // references hashed JS/CSS bundle URLs, so serving a stale cached shell
  // would silently keep running old code after every deploy. Only fall back
  // to a cached copy when the network is unreachable (offline).
  if (request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Immutable hashed assets (Vite fingerprints the filename per build) are
  // safe to cache-first — a new build always produces a new URL.
  if (url.pathname.startsWith('/assets/') || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

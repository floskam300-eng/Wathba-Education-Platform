// Derive a per-tenant cache key from the hostname so that each teacher
// subdomain gets its own isolated cache. This allows a student to install
// the PWA from multiple teacher subdomains on the same device without
// cache conflicts (e.g. teacher1.wathba.site and teacher2.wathba.site).
//
// v3: stopped caching /assets/* in the Cache API. Hashed assets are immutable
// and now served with `Cache-Control: max-age=31536000, immutable`, so the
// browser HTTP cache handles them correctly on its own. Caching them here too
// meant WebKit could mix chunks from different deploy generations under disk
// pressure ("Importing binding name 'x' is not found"). Bumping the version
// purges all stale per-tenant caches on devices that are currently stuck.
const _hostname = self.location.hostname;
const _subdomain = _hostname.split('.')[0] || 'default';
const CACHE_NAME = `wathba-${_subdomain}-v3`;

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

  // Hashed assets (/assets/*) are NOT cached here anymore. They are immutable
  // (content-hashed filenames + `Cache-Control: max-age=31536000, immutable`
  // from the server), so the browser HTTP cache serves repeat visits without
  // revalidation and without any risk of mixing deploy generations. The generic
  // network-first branch below still gives them an offline fallback.

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

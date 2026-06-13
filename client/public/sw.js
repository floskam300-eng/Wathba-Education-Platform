// Derive a per-tenant cache key from the hostname so that each teacher
// subdomain gets its own isolated cache. This allows a student to install
// the PWA from multiple teacher subdomains on the same device without
// cache conflicts (e.g. teacher1.wathba.site and teacher2.wathba.site).
const _hostname = self.location.hostname;
const _subdomain = _hostname.split('.')[0] || 'default';
const CACHE_NAME = `wathba-${_subdomain}-v1`;

const STATIC_ASSETS = [
  '/',
  '/favicon.png',
  '/wathba-logo.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
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
    fetch(request).catch(() => caches.match('/'))
  );
});

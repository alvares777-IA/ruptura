const CACHE = 'ruptura-v1';

const PRECACHE = [
  '/css/custom.css',
  '/js/main.js',
  '/js/scanner.js',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isExternal = url.origin !== self.location.origin;
  const isStatic = /^\/(css|js|icons|fonts)\//.test(url.pathname) || url.pathname === '/manifest.json';

  if (isExternal || isStatic) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Páginas da app: network-first (autenticação sempre válida)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Service Worker offline-first com estratégia por tipo de recurso.
// - Navegações e index.html: network-first (nunca prende bundle velho após deploy)
// - Assets com hash (JS/CSS): cache-first (imutáveis, seguros para cache longo)
// - sw.js e manifest.json: nunca cacheados aqui (o próprio SW não se auto-cacheia)
// - Offline: navegação cai para /index.html do cache.
const CACHE_NAME = 'marketsystem-cache-v3';
const CORE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Nunca intercepta o próprio SW nem o manifest (evita loop / versão presa).
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js')) return;
  if (url.pathname.endsWith('/manifest.json') || url.pathname.endsWith('manifest.json')) return;

  const isNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first: deploy novo aparece no primeiro load com rede;
    // sem rede, serve o index.html do cache.
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then(hit => hit || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

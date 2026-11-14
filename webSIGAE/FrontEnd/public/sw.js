const CACHE_NAME = 'sigae-pwa-v2';
const PRECACHE_ASSETS = [
  './manifest.json',
  './favicon.svg',
  './logo-colegio.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

// Instalación: precachear recursos estáticos mínimos de la shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activación: limpiar inmediatamente versiones anteriores de caché
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cachear solo recursos estáticos del mismo origen; NUNCA /api ni /uploads
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api') || url.pathname.includes('/uploads')) return;

  // Navegación HTML: red primero para recibir siempre la versión más reciente
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Otros recursos estáticos: network-first con respaldo en caché
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});

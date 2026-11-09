const CACHE_NAME = 'sigae-pwa-v9';
const PRECACHE_ASSETS = [
  './manifest.json',
  './favicon.svg',
  './logo-colegio.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Instalación: precachear recursos estáticos mínimos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activación: limpiar inmediatamente todas las cachés anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: interceptar y cachear recursos estáticos, NUNCA llamadas a la API
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar métodos que no sean GET
  if (req.method !== 'GET') {
    return;
  }

  // Ignorar llamadas a endpoints de API o uploads
  if (url.pathname.includes('/api') || url.pathname.includes('/uploads')) {
    return;
  }

  // Si es navegación HTML, red primero siempre para obtener la versión más reciente
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Para otros recursos: Network first con fallback a caché para garantizar frescura
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

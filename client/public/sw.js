const APP_CACHE = 'badam-satti-app-v7';
const CARD_CACHE = 'badam-satti-cards-v7';
const APP_SHELL = ['/', '/manifest.json', '/images/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== APP_CACHE && key !== CARD_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.url.includes('/socket.io/')) return;

  const url = new URL(request.url);
  const isCard = url.origin === self.location.origin && url.pathname.startsWith('/images/cards/');

  if (isCard) {
    event.respondWith(
      caches.open(CARD_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return cache.match(request);
        }
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(APP_CACHE).then((cache) => cache.put('/', response.clone()));
          return response;
        })
        .catch(() => caches.match('/'))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

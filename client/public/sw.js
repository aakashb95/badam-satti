const APP_CACHE = 'badam-satti-app-v15';
const CARD_CACHE = 'badam-satti-cards-v15';
const APP_ROOT = '/badam7/';
const APP_SHELL = [
  APP_ROOT,
  `${APP_ROOT}manifest.json`,
  `${APP_ROOT}images/icon.svg`,
  `${APP_ROOT}sounds/card-deal.mp3`,
  `${APP_ROOT}sounds/card-play0.mp3`,
];

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
  const isCard = url.origin === self.location.origin && url.pathname.startsWith(`${APP_ROOT}images/cards/`);
  const isSound = url.origin === self.location.origin && url.pathname.startsWith(`${APP_ROOT}sounds/`);

  // Sounds are precached and only change with the cache version, so serve them
  // from the cache first and keep the table audible on a poor connection.
  if (isSound) {
    event.respondWith(
      caches.open(APP_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

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
          if (response.ok) caches.open(APP_CACHE).then((cache) => cache.put(APP_ROOT, response.clone()));
          return response;
        })
        .catch(() => caches.match(APP_ROOT))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

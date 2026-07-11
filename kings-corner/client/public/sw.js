const CACHE = 'kings-corner-v2';
const APP_ROOT = '/kings-corner/';
const SHELL = [APP_ROOT, `${APP_ROOT}fonts/Haskoy-Regular.woff2`, `${APP_ROOT}fonts/Haskoy-SemiBold.woff2`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.url.includes('/socket.io/')) return;
  const url = new URL(request.url);
  const cacheableAsset = url.origin === self.location.origin && (url.pathname.startsWith(`${APP_ROOT}images/cards/`) || url.pathname.startsWith(`${APP_ROOT}fonts/`) || ['script', 'style', 'image', 'font'].includes(request.destination));

  if (cacheableAsset) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(APP_ROOT, response.clone()));
      return response;
    }).catch(() => caches.match(APP_ROOT)));
  }
});

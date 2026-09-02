/* Офлайн-кэш. Меняйте VERSION при выкладке новой версии. */
const VERSION = 'owls-day-v4';
const ASSETS = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './assets/owl-mark.png?v=2', './assets/icon-192.png', './assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Сеть первой, кэш — запасной: обновления приезжают сразу, офлайн работает. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok && new URL(e.request.url).origin === location.origin) {
          const copy = r.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

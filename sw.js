/* Офлайн-кэш. Меняйте VERSION при выкладке новой версии. */
const VERSION = 'owls-day-v19';
const ASSETS = [
  './', './index.html', './app.js?v=19', './manifest.webmanifest',
  './assets/owl-mark.png?v=2',
  './assets/apple-touch-icon.png?v=18', './assets/owls-day-192.png?v=18', './assets/owls-day-512.png?v=18',
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
  /* html и скрипт — всегда свежие, иначе после обновления страница и код могут разойтись */
  const fresh = e.request.mode === 'navigate' || /\/(app\.js|index\.html)(\?|$)/.test(e.request.url);
  e.respondWith(
    fetch(e.request, fresh ? { cache: 'no-store' } : undefined)
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

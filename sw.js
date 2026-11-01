// Offline-Cache. Bei Änderungen an den Dateien VERSION erhöhen.
const VERSION = 'fit-v2';
const ASSETS = [
  './', './index.html', './app.css', './app.js', './figures.js', './exercises.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/plex-sans-400.woff2', './fonts/plex-sans-500.woff2', './fonts/plex-sans-600.woff2', './fonts/plex-sans-700.woff2',
  './fonts/plex-mono-400.woff2', './fonts/plex-mono-500.woff2', './fonts/plex-mono-600.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Netz zuerst (Updates kommen an), Cache als Rückfall (offline)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

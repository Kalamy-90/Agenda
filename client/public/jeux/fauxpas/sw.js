// Service worker : met le jeu en cache pour jouer hors ligne une fois installé.
// Changer VERSION à chaque mise à jour pour forcer le rafraîchissement du cache.
const VERSION = 'fauxpas-agenda-reload-20261008';
const FILES = [
  './',
  'index.html',
  'tablette.html',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable.png',
  'assets/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord (pour voir les modifications pendant le développement), cache si hors ligne.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(VERSION).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});

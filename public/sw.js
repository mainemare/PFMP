'use strict';
// Service worker : rend l'application installable et garde une copie des pages pour un démarrage rapide.
// Les données (/api/...) ne sont jamais mises en cache : elles viennent toujours du serveur.
const CACHE = 'stages-v2';
// Chemins relatifs : fonctionne aussi dans un sous-dossier (GitHub Pages : /PFMP/).
const PAGES = ['./', 'style.css', 'config.js', 'app.js', 'prof.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PAGES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  // Réseau d'abord (toujours la dernière version), copie locale si le réseau est coupé.
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});

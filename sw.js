/* PitchPlay app shell cache. Score data remains in local browser storage/IndexedDB. */
const CACHE_NAME = 'pitchplay-shell-v9';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './pitchplay-icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('pitchplay-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(req, response.clone()));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});

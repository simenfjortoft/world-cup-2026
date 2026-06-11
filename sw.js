/* World Cup 2026 , service worker
   - Pre-cache the app shell on install (index.html + manifest + icons)
   - Runtime: network-first for the data JSONs and HTML (so live scores win
     when online), with cache fallback (so the app keeps working offline)
   - Stale-while-revalidate for flags (rarely change)
   Bump CACHE_NAME on every meaningful release , the old cache is cleared on
   activate and waiting clients are claimed so the new SW takes over immediately.
*/
const CACHE_NAME = 'wc2026-v2';   // bumped to force a clean cache (clears any stale results.json from the v1 cache)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL).catch(()=>{})));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // skip cross-origin (Google Fonts, etc.)

  const isData = url.pathname.endsWith('.json');
  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  const isFlag = url.pathname.includes('/flags/');

  if (isData || isHTML) {
    // network-first: live scores beat the cached copy when online
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (isHTML) return caches.match('./index.html');   // fallback to the shell
        return new Response('', { status: 503 });
      }
    })());
    return;
  }

  if (isFlag) {
    // stale-while-revalidate: serve cache fast, refresh in the background
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const network = fetch(req).then(r => { cache.put(req, r.clone()); return r; }).catch(() => null);
      return cached || network || new Response('', { status: 504 });
    })());
    return;
  }

  // everything else: cache-first
  e.respondWith(caches.match(req).then(c => c || fetch(req)));
});

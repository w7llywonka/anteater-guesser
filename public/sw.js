// Anteater Guesser service worker: keeps satellite and label tiles on disk so repeat
// visits (and slow connections) do not have to download them again.
const TILES = 'ag-tiles-v1';
const SHELL = 'ag-shell-v1';
const MAX_TILES = 3000;
let puts = 0;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('arcgisonline.com') && url.pathname.includes('/tile/')) {
    e.respondWith(tile(req));
  } else if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    e.respondWith(cacheFirst(req, SHELL));
  }
});

async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  // Only cache readable (CORS) responses: opaque ones carry a huge quota penalty.
  if (res.ok && res.type !== 'opaque') {
    cache.put(req.url, res.clone());
    if (++puts % 200 === 0) trim(cache);
  }
  return res;
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

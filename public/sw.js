// Retired. Earlier versions cached map tiles here; this version deletes those caches and
// uninstalls itself so browsers that still have the old worker go back to plain loading.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
    })(),
  );
});

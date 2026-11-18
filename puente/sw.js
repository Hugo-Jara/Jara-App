// Reemplaza al service worker de la app vieja: borra lo guardado, se da de
// baja y recarga las pantallas abiertas para que pasen por el puente.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var llaves = await caches.keys();
    await Promise.all(llaves.map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var ventanas = await self.clients.matchAll({ type: 'window' });
    ventanas.forEach(function (c) { c.navigate(c.url); });
  })());
});

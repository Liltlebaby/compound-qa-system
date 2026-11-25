const CACHE = 'compound-qa-shell-v2';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['/', '/favicon.svg', '/manifest.webmanifest'])),
  );
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('compound-qa-shell-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const u = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    u.origin !== self.location.origin ||
    u.pathname.startsWith('/api/') ||
    u.pathname.includes('signin') ||
    u.pathname.includes('signout') ||
    u.pathname === '/callback'
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((r) => {
          if (r.ok && r.headers.get('content-type')?.includes('text/html')) {
            const c = r.clone();
            caches.open(CACHE).then((cache) => cache.put('/', c));
          }
          return r;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (/\.(js|css|woff2?|svg|png)$/.test(u.pathname)) {
    event.respondWith(
      caches.match(event.request).then(
        (c) =>
          c ||
          fetch(event.request).then((r) => {
            if (r.ok) {
              const copy = r.clone();
              caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            }
            return r;
          }),
      ),
    );
  }
});

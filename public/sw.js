const CACHE_NAME = 'siga-v27';
const API_CACHE_NAME = 'siga-api-v23';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.pathname.includes('hot-update')) return;
  if (url.pathname.includes('__metro')) return;
  if (url.pathname.includes('symbolicate')) return;

  const API_CACHE_ROUTES = [
    '/api/alunos', '/api/professores', '/api/turmas', '/api/salas',
    '/api/notas', '/api/presencas', '/api/eventos', '/api/anos-academicos',
    '/api/taxas', '/api/pagamentos', '/api/pautas', '/api/horarios',
    '/api/salas', '/api/usuarios', '/api/provincias', '/api/municipios',
  ];
  const isApiRoute = url.pathname.startsWith('/api/');
  const isCachedApi = API_CACHE_ROUTES.some((r) => url.pathname === r || url.pathname.startsWith(r + '/') || url.pathname.startsWith(r + '?'));

  if (isApiRoute && isCachedApi) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request, { cacheName: API_CACHE_NAME }))
    );
    return;
  }

  if (isApiRoute) return;

  if (request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match('/'))));
    return;
  }

  if (
    url.pathname.startsWith('/_expo/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
        );
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});

// -------------------------------------------------------
// PUSH NOTIFICATIONS
// -------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'QUETA', body: event.data ? event.data.text() : 'Nova notificação' };
  }

  const title = data.title || 'QUETA — Notificação';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/favicon-32.png',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: data.data?.tipo || 'sige',
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

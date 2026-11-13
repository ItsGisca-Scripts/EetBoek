const CACHE_NAME = 'eetdagboek-shell-v5';
const APP_FILES = [
    '',
    'index.html',
    'style.css',
    'config.js',
    'script.js',
    'export.html',
    'export.js',
    'manifest.webmanifest',
    'icon.svg',
    'icon-180.png',
    'icon-192.png',
    'icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES.map(file => new URL(file, self.registration.scope).href)))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(names
                .filter(name => name !== CACHE_NAME)
                .map(name => caches.delete(name))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== 'GET' ||
        requestUrl.origin !== self.location.origin ||
        requestUrl.pathname.startsWith('/api/')) return;

    event.respondWith(
        fetch(event.request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            }
            return response;
        }).catch(async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            throw new Error('Deze pagina is offline niet beschikbaar.');
        })
    );
});

self.addEventListener('push', event => {
    let message = {};
    try {
        message = event.data ? event.data.json() : {};
    } catch (error) {
        console.error('Pushbericht bevat geen geldige JSON.', error);
    }
    event.waitUntil(self.registration.showNotification(
        message.title || 'Tijd voor je eetdagboek',
        {
            body: message.body || 'Noteer je eetmoment.',
            icon: new URL('icon-192.png', self.registration.scope).href,
            badge: new URL('icon-192.png', self.registration.scope).href,
            tag: message.tag || 'eetdagboek-herinnering',
            data: { url: message.url || './' }
        }
    ));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(event.notification.data.url || './', self.registration.scope).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        const existing = windowClients.find(client => new URL(client.url).origin === self.location.origin);
        if (existing) {
            return existing.navigate(target).then(() => existing.focus());
        }
        return self.clients.openWindow(target);
    }));
});

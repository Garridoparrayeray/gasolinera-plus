importScripts('/js/alerts-store.js');

const CACHE_VERSION = 'v7';
const CACHE_NAME = 'gasolinera-shell-' + CACHE_VERSION;
const API_CACHE_NAME = 'gasolinera-api-' + CACHE_VERSION;
const SHELL_FILES = [
    '/',
    '/style.css',
    '/js/native.js',
    '/js/background.js',
    '/js/api.js',
    '/js/alerts-store.js',
    '/js/app.js',
    '/vendor/fonts/fonts.css',
    '/vendor/fonts/inter-latin-standard-normal.woff2',
    '/vendor/fonts/inter-latin-ext-standard-normal.woff2',
    '/vendor/fonts/bricolage-grotesque-latin-standard-normal.woff2',
    '/vendor/fonts/bricolage-grotesque-latin-ext-standard-normal.woff2',
    '/vendor/leaflet/leaflet.css',
    '/vendor/leaflet/leaflet.js',
    '/vendor/markercluster/MarkerCluster.css',
    '/vendor/markercluster/MarkerCluster.Default.css',
    '/vendor/markercluster/leaflet.markercluster.js',
    '/vendor/leaflet-heat/leaflet-heat.js',
    '/vendor/chartjs/chart.umd.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/data/stations-lite.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    const isCDN = url.hostname.endsWith('tile.openstreetmap.org');

    if (event.request.method !== 'GET') {
        return;
    }

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(API_CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    if (url.origin === self.location.origin || isCDN) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    }
});

async function notifyPriceDrops() {
    if (!(await AlertsStore.get('enabled'))) {
        return;
    }
    const drops = await AlertsStore.checkPrices();
    for (const drop of drops) {
        const notification = AlertsStore.notificationFor(drop);
        await self.registration.showNotification(notification.title, notification.options);
    }
}

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'price-drop-check') {
        event.waitUntil(notifyPriceDrops());
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = '/?station=' + encodeURIComponent(event.notification.data.ideess);
    event.waitUntil((async () => {
        const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if ('navigate' in client) {
                await client.navigate(url);
                return client.focus();
            }
        }
        return clients.openWindow(url);
    })());
});

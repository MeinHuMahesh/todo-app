// Service worker — bump VERSION whenever app files change to refresh the cache.
const VERSION = 'todo-v4';

const PRECACHE = [
    'todo.html',
    'css/todo.css',
    'js/todo.js',
    'js/supabase.config.js',
    'js/supabase-sdk.js',
    'js/offline-store.js',
    'manifest.json',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-512-maskable.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(VERSION)
            .then(c => c.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const req = e.request;
    const url = new URL(req.url);

    // Demo-data API: stale-while-revalidate so the app works offline.
    if (url.origin === 'https://jsonplaceholder.typicode.com' && req.method === 'GET') {
        e.respondWith(
            caches.match(req).then(hit => {
                const net = fetch(req)
                    .then(res => {
                        if (res.ok) {
                            const copy = res.clone();
                            caches.open(VERSION).then(c => c.put(req, copy));
                        }
                        return res;
                    })
                    .catch(() => hit);
                return hit || net;
            })
        );
        return;
    }

    // Supabase/auth traffic is always network-only (never cache).
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
        // Network-first for page loads (fresh app), cached shell when offline.
        e.respondWith(
            fetch(req).catch(() => caches.match('todo.html'))
        );
        return;
    }

    // Cache-first for same-origin static assets.
    e.respondWith(
        caches.match(req).then(hit =>
            hit || fetch(req).then(res => {
                if (res.ok && req.method === 'GET') {
                    const copy = res.clone();
                    caches.open(VERSION).then(c => c.put(req, copy));
                }
                return res;
            })
        )
    );
});
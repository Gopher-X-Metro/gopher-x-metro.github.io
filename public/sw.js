// Service worker: keeps the app shell and the generated transit data on the device.
// Live data (Metro Transit, Peak Transit, map tiles) is never cached here, so times are never stale.
const VERSION = "gxm-v1";
const SHELL = VERSION + "-shell";   // page, JS, CSS, images
const DATA = VERSION + "-data";     // generated GTFS JSON, refreshed in the background

self.addEventListener("install", event => {
    event.waitUntil(caches.open(SHELL).then(cache => cache.add("./")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

/** Stores a good answer; a 404 page or an opaque answer is never kept */
function keep(cacheName, request, response) {
    if (response.ok && response.type === "basic")
        caches.open(cacheName).then(cache => cache.put(request, response)).catch(() => {});
}

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);

    // The page itself: newest when online (so deploys show up at once), last copy when not
    if (request.mode === "navigate") {
        event.respondWith(fetch(request)
            .then(response => { keep(SHELL, "./", response.clone()); return response; })
            .catch(() => caches.match("./").then(hit => hit ?? Response.error())));
        return;
    }

    // Built files have their hash in the name, so a stored copy is always the right one
    if (path.startsWith("assets/")) {
        event.respondWith(caches.match(request).then(hit => hit ?? fetch(request).then(response => {
            keep(SHELL, request, response.clone());
            return response;
        })));
        return;
    }

    // Schedules, stops and shapes: the newest when the network answers within 3 s, otherwise the stored copy.
    // (Network first because the files of one weekly GTFS build refer to each other, so they shouldn't be mixed.)
    if (/^(gtfs|data)\//.test(path)) {
        event.respondWith(caches.open(DATA).then(async cache => {
            const hit = await cache.match(request);
            const fresh = fetch(request).then(response => {
                if (response.ok && response.type === "basic") cache.put(request, response.clone());
                return response;
            });
            if (!hit) return fresh;
            const slow = new Promise(resolve => setTimeout(() => resolve(hit), 3000));
            return Promise.race([fresh.catch(() => hit), slow]);
        }));
        return;
    }

    // Images and the manifest: answer from the device at once, and fetch a fresh copy for next time
    if (/^(vehicles|favicon|LoadingScreenAssets)\//.test(path) || path === "manifest.json") {
        event.respondWith(caches.open(SHELL).then(async cache => {
            const hit = await cache.match(request);
            const fresh = fetch(request).then(response => {
                if (response.ok && response.type === "basic") cache.put(request, response.clone());
                return response;
            });
            if (!hit) return fresh;
            event.waitUntil(fresh.catch(() => {}));
            return hit;
        }));
    }
});

// Palermo PWA service worker
// Strategy:
//  - Open-Meteo (weather): network-only, never cached (always fresh data)
//  - App shell (HTML, CSS, JS, fonts, Leaflet, icon): cache-first
//  - Map tiles (OSM, OpenSeaMap): stale-while-revalidate, so offline use keeps old tiles

const VERSION = 'palermo-v9';
const SHELL = 'palermo-shell-' + VERSION;
const TILES = 'palermo-tiles';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+3:wght@300;400;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Weather API: bypass cache entirely, always hit network
  if (url.hostname === 'api.open-meteo.com') {
    return; // default network handling
  }

  // 2) Map tiles: stale-while-revalidate
  if (url.hostname.endsWith('tile.openstreetmap.org') || url.hostname.endsWith('openseamap.org') || url.hostname.endsWith('tiles.openseamap.org')) {
    event.respondWith(staleWhileRevalidate(req, TILES));
    return;
  }

  // 3) Navigation requests: network-first so new deploys propagate, fallback to cache when offline
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL));
    return;
  }

  // 4) Everything else (shell assets, fonts, icon): cache-first
  event.respondWith(cacheFirst(req, SHELL));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
      const cache = await caches.open(cacheName);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (e) {
    return cached || Response.error();
  }
}

async function networkFirst(req, cacheName) {
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (e) {
    const cached = await caches.match(req) || await caches.match('./index.html');
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetching = fetch(req).then(resp => {
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  }).catch(() => cached);
  return cached || fetching;
}

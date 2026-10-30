// Автогенерация: node tools/build-sw.mjs
const CACHE = 'smilex-quest-v1793368437043';
const PRECACHE = [
  "./",
  "app.js",
  "assets/people/alesya.webp",
  "assets/people/alla.webp",
  "assets/people/artem.webp",
  "assets/people/ivan.webp",
  "assets/people/ksyusha.webp",
  "assets/people/marina.webp",
  "assets/people/pasha.webp",
  "assets/ui/icon-192.png",
  "assets/ui/icon-512.png",
  "assets/ui/logo-smilex-wide.png",
  "assets/ui/logo-smilex.png",
  "audio/audio.js",
  "cases/smilex.json",
  "dist/app.js",
  "engine/game.js",
  "engine/storage.js",
  "index.html",
  "manifest.webmanifest",
  "styles.css",
  "ui/components/cards.js",
  "ui/dom.js",
  "ui/focus.js",
  "ui/screens/accuse.js",
  "ui/screens/board.js",
  "ui/screens/interrogation.js",
  "ui/screens/intro.js",
  "ui/screens/location.js",
  "ui/screens/notebook.js",
  "ui/screens/puzzle.js",
  "ui/screens/title.js",
  "ui/theme.js"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('./'))));
});

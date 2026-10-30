// Пересобирает sw.js со списком файлов для офлайна. Запуск: node tools/build-sw.mjs [номер версии]
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [relative(root, p).replaceAll('\\', '/')];
});
const files = ['assets', 'ui', 'engine', 'audio', 'cases', 'dist'].flatMap((d) => walk(join(root, d)))
  .concat(['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']).sort();
const version = process.argv[2] || String(Date.now());

writeFileSync(join(root, 'sw.js'), `// Автогенерация: node tools/build-sw.mjs
const CACHE = 'smilex-quest-v${version}';
const PRECACHE = ${JSON.stringify(['./', ...files], null, 2)};

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
`);
console.log('sw.js:', files.length + 1, 'файлов, версия', version);

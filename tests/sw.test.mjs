import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [relative(root, p).replaceAll('\\', '/')];
});

test('каждый путь из PRECACHE существует на диске', () => {
  for (const p of list) if (p !== './') assert.ok(existsSync(join(root, p)), `нет файла ${p}`);
});

test('все файлы приложения перечислены в PRECACHE', () => {
  const need = ['assets', 'ui', 'engine', 'audio', 'cases'].flatMap((d) => walk(join(root, d)))
    .concat(['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']);
  for (const f of need) assert.ok(list.includes(f), `не в кэше: ${f}`);
});

test('версия кэша задана, старые кэши удаляются', () => {
  assert.match(sw, /const CACHE = 'smilex-quest-v\d+'/);
  assert.match(sw, /caches\.delete/);
});

test('манифест ссылается на существующие иконки', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.lang, 'ru');
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), i.src);
});

test('поведение воркера: установка, чистка старых кэшей, ответ из кэша', async () => {
  const { runInNewContext } = await import('node:vm');
  const handlers = {}, store = new Map([['old-cache', new Map()]]);
  const added = [];
  const caches = {
    open: async (name) => { const m = store.get(name) ?? new Map(); store.set(name, m); return { addAll: async (l) => { added.push(...l); l.forEach((u) => m.set(u, 'x')); } }; },
    keys: async () => [...store.keys()],
    delete: async (k) => store.delete(k),
    match: async (req) => { for (const m of store.values()) if (m.has(req.url)) return 'из-кэша'; return undefined; },
  };
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting() {}, clients: { claim() {} } };
  runInNewContext(sw, { self, caches, fetch: async () => { throw new Error('offline'); } });
  let p; handlers.install({ waitUntil: (x) => { p = x; } }); await p;
  assert.deepEqual(added, list);
  handlers.activate({ waitUntil: (x) => { p = x; } }); await p;
  assert.equal(store.has('old-cache'), false);
  let answer; handlers.fetch({ request: { method: 'GET', url: 'app.js' }, respondWith: (x) => { answer = x; } });
  assert.equal(await answer, 'из-кэша');
});

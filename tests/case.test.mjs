import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCase, fullPassMinutes } from '../tools/check-case.mjs';

const load = () => JSON.parse(readFileSync(new URL('../cases/smilex.json', import.meta.url), 'utf8'));
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const has = (c, re) => checkCase(c, { root }).some((p) => re.test(p));

test('дело smilex.json проходит проверку', () => {
  assert.deepEqual(checkCase(load(), { root }), []);
});

test('полный проход не умещается в таймер: приходится выбирать', () => {
  const c = load();
  assert.ok(fullPassMinutes(c) > c.durationMin * 0.4, 'слишком мало действий для таймера');
});

test('несуществующий id в requires обнаруживается', () => {
  const c = load();
  c.clues[0].requires = ['нет_такой'];
  assert.ok(has(c, /нет_такой/));
});

test('цикл в requires даёт недостижимую улику', () => {
  const c = load();
  const [a, b] = c.clues.filter((x) => x.location === 'boardroom');
  a.requires = [b.id]; b.requires = [a.id];
  assert.ok(has(c, /недостижим/));
});

test('убийца вне списка подозреваемых обнаруживается', () => {
  const c = load();
  c.answer.killer = 'никто';
  assert.ok(has(c, /убийц/i));
});

test('недостающее фото подозреваемого обнаруживается', () => {
  const c = load();
  c.suspects[0].photo = 'assets/people/нет.webp';
  assert.ok(has(c, /фото/i));
});

test('таймлайн с неизвестным местом обнаруживается', () => {
  const c = load();
  const t = c.puzzles.find((p) => p.type === 'timeline');
  t.solution['ivan|1'] = 'на_луне';
  assert.ok(has(c, /на_луне/));
});

test('order: решение не перестановка и уже готовый порядок обнаруживаются', () => {
  const c = load();
  const o = c.puzzles.find((p) => p.type === 'order');
  o.solution = o.solution.slice(1);
  assert.ok(has(c, /перестановка/));
  const c2 = load();
  const o2 = c2.puzzles.find((p) => p.type === 'order');
  o2.items = o2.solution.map((id) => ({ id, text: id }));
  assert.ok(has(c2, /уже стоят/));
});

test('diff: решение должно совпадать с реально отличающимися строками', () => {
  const c = load();
  c.puzzles.find((p) => p.type === 'diff').solution = ['l1'];
  assert.ok(has(c, /отличающимися/));
});

test('улика, которую предъявляют, должна существовать', () => {
  const c = load();
  c.suspects.find((s) => s.confrontations?.length).confrontations[0].clue = 'нет_улики';
  assert.ok(has(c, /нет_улики/));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../engine/game.js';
import { memoryStorage } from '../engine/storage.js';

const mini = () => ({
  durationMin: 10,
  costs: { search: 10, ask: 20, confront: 30, wrong: 5 },
  acts: [{ id: 'a1', goal: 'p_code' }, { id: 'a2', goal: 'p_order' }],
  locations: [{ id: 'l1', act: 1 }, { id: 'l2', act: 2 }],
  suspects: [
    { id: 'a', name: 'А', deflect: 'Не про меня.', questions: [
      { id: 'a1', q: 'Где были?', a: 'В зале', unlocks: ['c3'] },
      { id: 'a2', q: 'Что видели?', a: 'Ничего', requires: ['c1'] },
      { id: 'a3', q: 'Поздний вопрос', a: 'Поздно', act: 2 },
    ], confrontations: [{ id: 'a_c1', clue: 'c1', a: 'Ладно, это моё.', unlocks: ['c4'] }] },
    { id: 'b', name: 'Б', questions: [] },
  ],
  clues: [
    { id: 'c1', title: 'Чек', text: 'Чек', location: 'l1', requires: [] },
    { id: 'c2', title: 'Ключ', text: 'Ключ', location: 'l1', requires: ['c1'] },
    { id: 'c3', title: 'Запись', text: 'Запись', location: null, requires: [] },
    { id: 'c4', title: 'Признание', text: 'Признание', location: null, requires: [] },
    { id: 'c5', title: 'Поздняя', text: 'Поздняя', location: 'l2', requires: [] },
  ],
  puzzles: [
    { id: 'p_code', type: 'code', solution: ['1403'], reward: ['c3'] },
    { id: 'p_diff', type: 'diff', solution: ['l2', 'l4'] },
    { id: 'p_time', type: 'timeline', solution: { 'a|1': 'hall', 'b|1': ['bim', 'unknown'] } },
    { id: 'p_order', type: 'order', solution: ['x', 'y', 'z'] },
  ],
  hints: ['Подсказка 1', 'Подсказка 2'],
  answer: { killer: 'b', motive: 'm1', method: 'x1', keyClues: ['c1'] },
  endings: { win: 'Победа', lose: 'Мимо' },
});
const mk = () => createGame(mini(), memoryStorage());

test('search блокирует улику без требований и открывает после; повтор бесплатен', () => {
  const g = mk();
  const r = g.search('c2');
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['c1']);
  assert.equal(g.search('c1').ok, true);
  const left = g.state.secondsLeft;
  assert.equal(g.search('c1').ok, true);
  assert.equal(g.state.secondsLeft, left);
  assert.deepEqual(g.state.found, ['c1']);
});

test('действия стоят времени', () => {
  const g = mk();
  assert.equal(g.state.secondsLeft, 600);
  g.search('c1');
  assert.equal(g.state.secondsLeft, 590);
  g.ask('a', 'a1');
  assert.equal(g.state.secondsLeft, 570);
});

test('улика из другого акта недоступна, пока акт не наступил', () => {
  const g = mk();
  assert.equal(g.search('c5').ok, false);
  assert.equal(g.ask('a', 'a3').ok, false);
  g.state.act = 2;
  assert.equal(g.search('c5').ok, true);
  assert.equal(g.ask('a', 'a3').ok, true);
});

test('ask: unlocks, requires, повтор не дублирует и не списывает время', () => {
  const g = mk();
  assert.equal(g.ask('a', 'a2').ok, false);
  const r = g.ask('a', 'a1');
  assert.equal(r.reply, 'В зале');
  assert.ok(g.state.found.includes('c3'));
  const left = g.state.secondsLeft;
  g.ask('a', 'a1');
  assert.equal(g.state.secondsLeft, left);
  assert.equal(g.state.log.filter((x) => x.id === 'a1').length, 1);
});

test('confront: нужная улика даёт ответ и unlocks, лишняя даёт отговорку, повтор бесплатен', () => {
  const g = mk();
  assert.equal(g.confront('a', 'c1').ok, false, 'улика ещё не найдена');
  g.search('c1');
  const wrong = g.confront('b', 'c1');
  assert.equal(wrong.matched, false);
  const hit = g.confront('a', 'c1');
  assert.equal(hit.matched, true);
  assert.equal(hit.reply, 'Ладно, это моё.');
  assert.ok(g.state.found.includes('c4'));
  const miss = createGame(mini(), memoryStorage());
  miss.search('c1');
  assert.equal(miss.confront('a', 'c3').ok, false);
  const left = g.state.secondsLeft;
  g.confront('a', 'c1');
  assert.equal(g.state.secondsLeft, left);
});

test('загадка code: верный ответ открывает награду и переводит акт', () => {
  const g = mk();
  const bad = g.solvePuzzle('p_code', '9999');
  assert.equal(bad.correct, false);
  assert.equal(g.state.act, 1);
  const ok = g.solvePuzzle('p_code', ' 14-03 ');
  assert.equal(ok.correct, true);
  assert.equal(ok.advanced, true);
  assert.equal(g.state.act, 2);
  assert.ok(g.state.found.includes('c3'));
  assert.deepEqual(g.state.solved, ['p_code']);
});

test('загадки diff, timeline, order проверяют ответ и считают правильные части', () => {
  const g = mk();
  assert.equal(g.solvePuzzle('p_diff', ['l2']).correct, false);
  assert.equal(g.solvePuzzle('p_diff', ['l4', 'l2']).correct, true);
  const t = g.solvePuzzle('p_time', { 'a|1': 'hall', 'b|1': 'kitchen' });
  assert.equal(t.correct, false);
  assert.equal(t.right, 1);
  assert.equal(g.solvePuzzle('p_time', { 'a|1': 'hall', 'b|1': 'unknown' }).correct, true, 'допустим любой из вариантов');
  const o = g.solvePuzzle('p_order', ['x', 'z', 'y']);
  assert.equal(o.correct, false);
  assert.equal(o.right, 1);
  assert.equal(g.solvePuzzle('p_order', ['x', 'y', 'z']).correct, true);
});

test('accuse: две попытки, штрафы и итог', () => {
  const g = mk();
  const first = g.accuse({ killer: 'a', motive: 'm1', method: 'x1', keyClue: 'c1' });
  assert.equal(first.correct, false);
  assert.equal(first.final, false);
  const second = g.accuse({ killer: 'b', motive: 'm1', method: 'x1', keyClue: 'c1' });
  assert.equal(second.correct, true);
  assert.equal(second.final, true);
  assert.equal(second.ending, 'Победа');
  assert.equal(second.score, 100 - 25);
  const g2 = mk();
  g2.accuse({ killer: 'a', motive: 'm1', method: 'x1' });
  const lost = g2.accuse({ killer: 'a', motive: 'm1', method: 'x1' });
  assert.equal(lost.final, true);
  assert.equal(lost.correct, false);
  assert.equal(lost.ending, 'Мимо');
});

test('accuse: подсказки и неверные части снижают оценку', () => {
  const clean = mk().accuse({ killer: 'b', motive: 'm1', method: 'x1', keyClue: 'c1' });
  assert.equal(clean.score, 100);
  const g = mk(); g.hint(); g.hint();
  assert.equal(g.accuse({ killer: 'b', motive: 'm1', method: 'x1', keyClue: 'c1' }).score, 90);
  assert.equal(g.hint(), null);
  const partial = mk().accuse({ killer: 'b', motive: 'zz', method: 'x1', keyClue: 'c9' });
  assert.equal(partial.correct, true);
  assert.equal(partial.score, 60);
});

test('повреждённое хранилище даёт чистое состояние', () => {
  const bad = { load() { throw new Error('boom'); }, save() { throw new Error('boom'); } };
  const g = createGame(mini(), bad);
  assert.deepEqual(g.state.found, []);
  assert.equal(g.search('c1').ok, true);
  const junk = { load: () => 'мусор', save() {} };
  assert.deepEqual(createGame(mini(), junk).state.found, []);
  const old = { load: () => ({ found: ['c1'], asked: [], secondsLeft: 100, hintsUsed: 0 }), save() {} };
  const g3 = createGame(mini(), old);
  assert.deepEqual(g3.state.log, []);
  assert.equal(g3.state.act, 1);
});

test('время вышло: действия стоят времени до нуля, timeUp ставится', () => {
  const g = mk();
  g.tick(599);
  assert.equal(g.state.timeUp, false);
  g.search('c1');
  assert.equal(g.state.secondsLeft, 0);
  assert.equal(g.state.timeUp, true);
});

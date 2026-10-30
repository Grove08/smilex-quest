import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createGame } from '../engine/game.js';
import { memoryStorage } from '../engine/storage.js';

const pick = (v) => [].concat(v)[0];

function answerFor(p) {
  if (p.type === 'code') return p.solution[0];
  if (p.type === 'timeline') return Object.fromEntries(Object.entries(p.solution).map(([k, v]) => [k, pick(v)]));
  return p.solution;
}

// Статические проверки ссылок и данных.
function checkStatic(c, root, problems) {
  const suspects = c.suspects || [], clues = c.clues || [], puzzles = c.puzzles || [];
  const questions = suspects.flatMap((s) => s.questions || []);
  const confs = suspects.flatMap((s) => s.confrontations || []);
  const all = [...clues, ...questions, ...confs, ...puzzles, ...suspects, ...(c.locations || []), ...(c.acts || [])];
  const ids = all.map((x) => x.id);
  ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => problems.push(`id не уникален: ${id}`));
  const known = new Set(ids);

  for (const it of [...clues, ...questions, ...confs, ...puzzles]) {
    for (const r of it.requires || []) if (!known.has(r)) problems.push(`${it.id}: requires ссылается на несуществующий id ${r}`);
    for (const u of [...(it.unlocks || []), ...(it.reward || [])]) if (!clues.some((x) => x.id === u)) problems.push(`${it.id}: ссылается на несуществующую улику ${u}`);
  }
  for (const cl of clues) if (cl.location && !(c.locations || []).some((l) => l.id === cl.location)) problems.push(`${cl.id}: неизвестная локация ${cl.location}`);
  for (const cf of confs) if (!clues.some((x) => x.id === cf.clue)) problems.push(`${cf.id}: предъявляется несуществующая улика ${cf.clue}`);
  for (const a of c.acts || []) if (!puzzles.some((p) => p.id === a.goal)) problems.push(`${a.id}: цель акта ${a.goal} не найдена`);

  const a = c.answer || {};
  if (!suspects.some((s) => s.id === a.killer)) problems.push('answer.killer: убийца не из списка подозреваемых');
  if (!(c.motives || []).some((m) => m.id === a.motive)) problems.push('answer.motive не из списка motives');
  if (!(c.methods || []).some((m) => m.id === a.method)) problems.push('answer.method не из списка methods');
  for (const k of a.keyClues || []) if (!clues.some((x) => x.id === k)) problems.push(`answer.keyClues: нет улики ${k}`);
  if (!(a.keyClues || []).length) problems.push('answer.keyClues пуст');

  for (const s of suspects) if (!s.photo || !existsSync(join(root, s.photo))) problems.push(`${s.id}: нет файла фото ${s.photo}`);

  for (const p of puzzles) {
    if (p.type === 'code' && !(p.solution || []).length) problems.push(`${p.id}: у кода нет решения`);
    if (p.type === 'order') {
      const ids2 = (p.items || []).map((x) => x.id);
      if (![...ids2].sort().every((v, i) => v === [...p.solution].sort()[i]) || ids2.length !== p.solution.length) problems.push(`${p.id}: solution не перестановка items`);
      if (ids2.every((v, i) => v === p.solution[i])) problems.push(`${p.id}: items уже стоят в правильном порядке`);
    }
    if (p.type === 'diff') {
      const differing = (p.lines || []).filter((l) => l.a !== l.b).map((l) => l.id).sort();
      if (JSON.stringify(differing) !== JSON.stringify([...p.solution].sort())) problems.push(`${p.id}: solution не совпадает с реально отличающимися строками`);
    }
    if (p.type === 'timeline') {
      for (const [k, v] of Object.entries(p.solution)) {
        const [sid, slot] = k.split('|');
        if (!suspects.some((s) => s.id === sid)) problems.push(`${p.id}: неизвестный подозреваемый ${sid}`);
        if (!(p.slots || []).some((s) => s.id === slot)) problems.push(`${p.id}: неизвестный слот ${slot}`);
        for (const place of [].concat(v)) if (!(p.places || []).some((x) => x.id === place)) problems.push(`${p.id}: неизвестное место ${place}`);
      }
    }
  }
}

// Прохождение «идеальным игроком»: всё должно открыться, финал должен дать 100 очков.
function checkPlaythrough(c, problems) {
  const huge = { ...c, durationMin: 100000 };
  const g = createGame(huge, memoryStorage());
  let progress = true;
  while (progress) {
    progress = false;
    for (const cl of c.clues) if (cl.location && !g.state.found.includes(cl.id) && g.search(cl.id).ok) progress = true;
    for (const s of c.suspects) {
      for (const q of s.questions || []) if (!g.state.asked.includes(q.id) && g.ask(s.id, q.id).ok) progress = true;
      for (const cf of s.confrontations || []) {
        if (!g.state.asked.includes(cf.id) && g.state.found.includes(cf.clue) && g.confront(s.id, cf.clue).matched) progress = true;
      }
    }
    for (const p of c.puzzles || []) {
      if (!g.state.solved.includes(p.id) && g.isUnlocked(p) && g.solvePuzzle(p.id, answerFor(p)).correct) progress = true;
    }
  }
  const unreachable = [
    ...c.clues.filter((x) => !g.state.found.includes(x.id)).map((x) => x.id),
    ...c.suspects.flatMap((s) => [...(s.questions || []), ...(s.confrontations || [])]).filter((x) => !g.state.asked.includes(x.id)).map((x) => x.id),
    ...(c.puzzles || []).filter((x) => !g.state.solved.includes(x.id)).map((x) => x.id),
  ];
  for (const id of unreachable) problems.push(`${id}: недостижим при полном прохождении`);
  if (g.state.act !== (c.acts || []).length) problems.push(`после полного прохождения акт ${g.state.act}, ожидался ${(c.acts || []).length}`);
  const r = g.accuse({ ...c.answer, keyClue: c.answer.keyClues[0] });
  if (!r.correct || r.score !== 100) problems.push('верный ответ не даёт 100 очков');
  return huge.durationMin * 60 - g.state.secondsLeft;
}

export function checkCase(c, { root = '.' } = {}) {
  const problems = [];
  checkStatic(c, root, problems);
  if (!problems.length) checkPlaythrough(c, problems);
  return problems;
}

export function fullPassMinutes(c) {
  const huge = { ...c, durationMin: 100000 };
  const g = createGame(huge, memoryStorage());
  let p = true;
  while (p) {
    p = false;
    for (const cl of c.clues) if (cl.location && !g.state.found.includes(cl.id) && g.search(cl.id).ok) p = true;
    for (const s of c.suspects) {
      for (const q of s.questions || []) if (!g.state.asked.includes(q.id) && g.ask(s.id, q.id).ok) p = true;
      for (const cf of s.confrontations || []) if (!g.state.asked.includes(cf.id) && g.state.found.includes(cf.clue) && g.confront(s.id, cf.clue).matched) p = true;
    }
    for (const pz of c.puzzles || []) if (!g.state.solved.includes(pz.id) && g.isUnlocked(pz) && g.solvePuzzle(pz.id, answerFor(pz)).correct) p = true;
  }
  return Math.round((huge.durationMin * 60 - g.state.secondsLeft) / 60);
}

if (process.argv[1] && process.argv[1].endsWith('check-case.mjs')) {
  const { readFileSync } = await import('node:fs');
  const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const c = JSON.parse(readFileSync(join(root, 'cases', 'smilex.json'), 'utf8'));
  const p = checkCase(c, { root });
  console.log(p.length ? p.join('\n') : `OK: дело проходимо. Полный проход без разговоров займёт ${fullPassMinutes(c)} мин из ${c.durationMin}.`);
  process.exit(p.length ? 1 : 0);
}

const COSTS = { search: 60, ask: 90, confront: 120, wrong: 60 };
const fresh = (c) => ({
  found: [], asked: [], log: [], tried: [], solved: [], act: 1, accusations: 0, notes: '',
  secondsLeft: Math.round((c.durationMin || 60) * 60), hintsUsed: 0, timeUp: false, started: false, seenAct: 0,
});
const norm = (s) => String(s ?? '').toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]/g, '');
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

function validState(s) {
  return s && typeof s === 'object' && Array.isArray(s.found) && Array.isArray(s.asked)
    && typeof s.secondsLeft === 'number' && typeof s.hintsUsed === 'number';
}

export function createGame(caseData, storage) {
  let loaded = null;
  try { loaded = storage.load(); } catch { loaded = null; }
  const state = validState(loaded) ? { ...fresh(caseData), ...loaded } : fresh(caseData);
  const costs = { ...COSTS, ...(caseData.costs || {}) };
  const save = () => { try { storage.save(state); } catch { /* игра идёт без сохранения */ } };
  const clue = (id) => caseData.clues.find((c) => c.id === id);
  const done = (id) => state.found.includes(id) || state.asked.includes(id) || state.solved.includes(id);
  const missing = (req = []) => req.filter((id) => !done(id));
  const reveal = (id) => { if (clue(id) && !state.found.includes(id)) state.found.push(id); };
  const actOf = (item) => item.act ?? (caseData.locations || []).find((l) => l.id === item.location)?.act ?? 1;
  const spend = (kind) => {
    state.secondsLeft = Math.max(0, state.secondsLeft - (costs[kind] || 0));
    if (state.secondsLeft === 0) state.timeUp = true;
  };
  const suspect = (id) => caseData.suspects.find((x) => x.id === id);

  const game = {
    state, caseData, costs, save, actOf,
    start() { state.started = true; save(); },
    reset() { Object.assign(state, fresh(caseData)); try { storage.clear?.(); } catch { /* */ } },
    isUnlocked(item) { return actOf(item) <= state.act && missing(item.requires).length === 0; },

    search(clueId) {
      const c = clue(clueId);
      if (!c) return { ok: false, missing: [] };
      if (state.found.includes(clueId)) return { ok: true, clue: c, already: true };
      if (actOf(c) > state.act) return { ok: false, missing: ['act'] };
      const m = missing(c.requires);
      if (m.length) return { ok: false, missing: m };
      spend('search'); reveal(clueId); save();
      return { ok: true, clue: c };
    },

    ask(suspectId, questionId) {
      const q = suspect(suspectId)?.questions.find((x) => x.id === questionId);
      if (!q) return { ok: false, missing: [] };
      if (state.asked.includes(q.id)) return { ok: true, reply: q.a, question: q, already: true };
      if (actOf(q) > state.act) return { ok: false, missing: ['act'] };
      const m = missing(q.requires);
      if (m.length) return { ok: false, missing: m };
      spend('ask');
      state.asked.push(q.id);
      state.log.push({ s: suspectId, kind: 'q', id: q.id, q: q.q, a: q.a });
      (q.unlocks || []).forEach(reveal);
      save();
      return { ok: true, reply: q.a, question: q };
    },

    confront(suspectId, clueId) {
      const s = suspect(suspectId);
      const c = clue(clueId);
      if (!s || !c || !state.found.includes(clueId)) return { ok: false };
      const key = `${suspectId}|${clueId}`;
      if (state.tried.includes(key)) {
        const prev = [...state.log].reverse().find((x) => x.s === suspectId && x.clue === clueId);
        return { ok: true, matched: !!prev?.matched, reply: prev?.a, already: true };
      }
      const hit = (s.confrontations || []).find((x) => x.clue === clueId && actOf(x) <= state.act && missing(x.requires).length === 0);
      const reply = hit ? hit.a : (s.deflect || 'Это ко мне отношения не имеет.');
      spend('confront');
      state.tried.push(key);
      if (hit) { state.asked.push(hit.id); (hit.unlocks || []).forEach(reveal); }
      state.log.push({ s: suspectId, kind: 'c', id: hit?.id || key, clue: clueId, matched: !!hit, q: `Предъявлено: ${c.title}`, a: reply });
      save();
      return { ok: true, matched: !!hit, reply };
    },

    solvePuzzle(puzzleId, answer) {
      const p = (caseData.puzzles || []).find((x) => x.id === puzzleId);
      if (!p) return { ok: false };
      if (state.solved.includes(p.id)) return { ok: true, correct: true, already: true };
      let correct = false, right = 0, total = 0;
      if (p.type === 'code') {
        correct = (p.solution || []).map(norm).includes(norm(answer));
      } else if (p.type === 'diff') {
        correct = sameSet(answer || [], p.solution);
        right = (answer || []).filter((x) => p.solution.includes(x)).length; total = p.solution.length;
      } else if (p.type === 'timeline') {
        const keys = Object.keys(p.solution);
        total = keys.length; right = keys.filter((k) => [].concat(p.solution[k]).includes((answer || {})[k])).length;
        correct = right === total;
      } else if (p.type === 'order') {
        total = p.solution.length; right = p.solution.filter((id, i) => (answer || [])[i] === id).length;
        correct = right === total;
      }
      if (!correct) { spend('wrong'); save(); return { ok: true, correct: false, right, total }; }
      state.solved.push(p.id);
      (p.reward || []).forEach(reveal);
      let advanced = false;
      if ((caseData.acts || [])[state.act - 1]?.goal === p.id && state.act < caseData.acts.length) { state.act += 1; advanced = true; }
      save();
      return { ok: true, correct: true, advanced, right, total };
    },

    hint() {
      const h = (caseData.hints || [])[state.hintsUsed];
      if (h === undefined) return null;
      state.hintsUsed += 1; save();
      return h;
    },

    tick(seconds = 1) {
      if (state.timeUp) return;
      state.secondsLeft = Math.max(0, state.secondsLeft - seconds);
      if (state.secondsLeft === 0) state.timeUp = true;
      save();
    },

    accuse({ killer, motive, method, keyClue }) {
      const a = caseData.answer;
      const correct = killer === a.killer;
      const motiveOk = motive === a.motive, methodOk = method === a.method, keyOk = (a.keyClues || []).includes(keyClue);
      let score = 0;
      if (correct) {
        score = 40 + (motiveOk ? 20 : 0) + (methodOk ? 20 : 0) + (keyOk ? 20 : 0);
        score = Math.max(0, score - state.hintsUsed * 5 - state.accusations * 25);
      } else {
        state.accusations += 1;
      }
      const final = correct || state.accusations >= 2;
      save();
      return { correct, final, attemptsLeft: Math.max(0, 2 - state.accusations), score, motiveOk, methodOk, keyOk,
        ending: correct ? caseData.endings.win : caseData.endings.lose };
    },
  };
  return game;
}

(function () {
const __m = {};
__m['engine/game.js'] = (() => {
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

function createGame(caseData, storage) {
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

return { createGame };
})();
__m['engine/storage.js'] = (() => {
const KEY = 'smilex-quest-v1';

function memoryStorage() {
  let saved = null;
  return { load: () => saved, save: (s) => { saved = JSON.parse(JSON.stringify(s)); }, clear: () => { saved = null; } };
}

function localStorageAdapter(key = KEY) {
  return {
    load() { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    save(s) { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* без сохранения */ } },
    clear() { try { localStorage.removeItem(key); } catch { /* без сохранения */ } },
  };
}

return { memoryStorage, localStorageAdapter };
})();
__m['ui/theme.js'] = (() => {
const svg = (inner, w = 400, h = 400) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${inner}</svg>`)}")`;
const noise = (freq, oct, k, [r, g, b], extra = '') =>
  `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${k} 0 0 0 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>${extra}`;

function applyTheme() {
  const t = {
    '--tex-grain': svg(noise('.9', 2, '1.1', [0, 0, 0]), 220, 220),
    '--tex-paper': svg(noise('.04', 3, '.9', [.55, .4, .2]) + noise('.7', 2, '.5', [.35, .25, .1]).replace("id='n'", "id='m'").replace('url(#n)', 'url(#m)'), 500, 500),
    '--tex-cork': svg(noise('.035', 4, '1.4', [.35, .2, .08]) + noise('.5', 2, '.9', [.25, .13, .04]).replace("id='n'", "id='m'").replace('url(#n)', 'url(#m)'), 600, 600),
    '--tex-wood': svg(noise('.012 .35', 4, '1.6', [.03, .02, .01]), 700, 700),
    '--tex-stain': svg("<radialGradient id='g'><stop offset='0' stop-color='%236b3f1d' stop-opacity='.35'/><stop offset='1' stop-color='%236b3f1d' stop-opacity='0'/></radialGradient><circle cx='60' cy='60' r='50' fill='url(%23g)'/><circle cx='60' cy='60' r='38' fill='none' stroke='%236b3f1d' stroke-opacity='.25' stroke-width='3'/>", 120, 120),
  };
  for (const [k, v] of Object.entries(t)) document.documentElement.style.setProperty(k, v);
}

return { applyTheme };
})();
__m['ui/dom.js'] = (() => {
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const fill = (el, ...kids) => { el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false)); return el; };
const btn = (label, onclick, cls = '') => h('button', { class: 'btn ' + cls, 'data-focus': '', type: 'button', onclick }, label);
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

return { h, fill, btn, fmtTime };
})();
__m['ui/focus.js'] = (() => {
// Навигация стрелками/Enter для пульта ТВ и клавиатуры.
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled && el.getAttribute('disabled') == null; };
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function pickNext(from, items, dir) {
  const c = center(from.getBoundingClientRect());
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const p = center(el.getBoundingClientRect());
    const dx = p.x - c.x, dy = p.y - c.y;
    const along = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy;
    const across = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

function enableFocusNav({ scopeFn, onBack }) {
  window.addEventListener('keydown', (e) => {
    const t = document.activeElement;
    const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
    if (e.key === 'Escape' || (e.key === 'Backspace' && !typing) || e.key === 'BrowserBack') { e.preventDefault(); onBack?.(); return; }
    if (!e.key.startsWith('Arrow') || typing) return;
    const scope = scopeFn();
    const items = [...scope.querySelectorAll('[data-focus]')].filter(visible);
    if (!items.length) return;
    e.preventDefault();
    const cur = items.includes(t) ? t : null;
    const next = cur ? pickNext(cur, items, e.key) : items[0];
    if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
  });
}

return { pickNext, enableFocusNav };
})();
__m['audio/audio.js'] = (() => {
// Генеративная музыка и звуки на Web Audio: ни одного аудиофайла.
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const KEY = 'smilex-quest-muted';

// нуар-джаз: Dm7 – G7 – Cmaj7 – A7 (бас-корень и аккорд)
const JAZZ = [
  { r: 38, c: [57, 60, 62, 65] }, { r: 43, c: [59, 62, 65, 69] },
  { r: 36, c: [59, 62, 64, 67] }, { r: 45, c: [61, 64, 67, 70] },
];
const DORIAN = [62, 64, 65, 67, 69, 71, 72, 74, 76];
const FINALE = [{ r: 36, c: [60, 64, 67, 72] }, { r: 43, c: [59, 62, 67, 71] }, { r: 45, c: [57, 60, 64, 69] }, { r: 41, c: [57, 60, 65, 69] }];

function createAudio() {
  let ac = null, master = null, noiseBuf = null, mood = 'off', timer = null, step = 0, next = 0, muted = false;
  const buses = {};
  try { muted = localStorage.getItem(KEY) === '1'; } catch { /* без сохранения */ }

  function init() {
    if (ac || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
      master.connect(lp).connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ac = null; }
  }
  const bus = (m) => buses[m] || (buses[m] = (() => { const g = ac.createGain(); g.gain.value = 0; g.connect(master); return g; })());

  function tone(out, t, midi, dur, { type = 'sine', vol = 0.15, atk = 0.01, lp = 3000, detune = 0 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = type; o.frequency.value = hz(midi); o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(out, t, dur, { vol = 0.1, hp = 4000, lp = 12000 } = {}) {
    const s = ac.createBufferSource(), g = ac.createGain(), a = ac.createBiquadFilter(), b = ac.createBiquadFilter();
    s.buffer = noiseBuf; a.type = 'highpass'; a.frequency.value = hp; b.type = 'lowpass'; b.frequency.value = lp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(a).connect(b).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const MOODS = {
    investigate: { eighth: 60 / 76 / 2, swing: 0.17, play(out, i, t) {
      const bar = JAZZ[Math.floor(i / 8) % 4], nextBar = JAZZ[(Math.floor(i / 8) + 1) % 4], s = i % 8;
      if (s % 2 === 0) { const walk = [bar.r, bar.r + 7, bar.r + 12, nextBar.r + 1][s / 2]; tone(out, t, walk, 0.5, { type: 'triangle', vol: 0.3, lp: 700, atk: 0.02 }); }
      if (s === 1 || s === 5) bar.c.forEach((m, k) => tone(out, t + k * 0.012, m, 0.9, { type: 'sine', vol: 0.05, lp: 2200 }));
      if (s === 2 || s === 6) noise(out, t, 0.12, { vol: 0.05, hp: 1800, lp: 8000 }); else noise(out, t, 0.05, { vol: 0.025 });
      if (Math.random() < 0.28 && s % 2 === 0) tone(out, t, rnd(DORIAN) + 12, 1.1, { type: 'sine', vol: 0.06, lp: 4000, atk: 0.005 });
    } },
    interrogation: { eighth: 60 / 58 / 2, swing: 0, play(out, i, t) {
      const s = i % 8;
      if (i % 64 === 0) { tone(out, t, 26, 8, { type: 'sawtooth', vol: 0.07, lp: 160, atk: 1.5 }); tone(out, t, 33, 8, { type: 'sawtooth', vol: 0.04, lp: 200, atk: 2, detune: 8 }); }
      if (s === 0 || s === 1) tone(out, t, 31, 0.35, { type: 'sine', vol: s ? 0.16 : 0.3, lp: 150, atk: 0.005 });
      if (Math.random() < 0.12) tone(out, t, rnd([74, 77, 81, 82]), 2.2, { type: 'sine', vol: 0.035, lp: 3500, atk: 0.01 });
    } },
    finale: { eighth: 60 / 92 / 2, swing: 0, play(out, i, t) {
      const bar = FINALE[Math.floor(i / 8) % 4], s = i % 8;
      if (s === 0) { tone(out, t, bar.r, 1.8, { type: 'triangle', vol: 0.3, lp: 600 }); bar.c.forEach((m) => tone(out, t, m - 12, 2.4, { type: 'sine', vol: 0.045, lp: 1800, atk: 0.2 })); }
      tone(out, t, bar.c[[0, 1, 2, 3, 2, 1, 3, 2][s]] + 12, 0.6, { type: 'sine', vol: 0.07, lp: 3500, atk: 0.005 });
      if (s === 0 || s === 4) noise(out, t, 0.1, { vol: 0.05, hp: 90, lp: 400 });
    } },
  };

  function pump() {
    const m = MOODS[mood];
    if (!ac || !m) return;
    const out = bus(mood);
    while (next < ac.currentTime + 0.4) {
      const t = next + (step % 2 ? m.swing * m.eighth : 0);
      try { m.play(out, step, Math.max(t, ac.currentTime)); } catch { /* пропускаем ноту */ }
      next += m.eighth; step++;
    }
  }

  return {
    get muted() { return muted; },
    unlock() { init(); if (ac && ac.state === 'suspended') ac.resume(); if (mood !== 'off') this.setMood(mood, true); },
    setMood(m, force = false) {
      if (m === mood && !force && timer) return;
      mood = m;
      if (!ac) return;
      for (const [k, g] of Object.entries(buses)) g.gain.setTargetAtTime(k === m ? 1 : 0, ac.currentTime, 0.6);
      clearInterval(timer); timer = null;
      if (!MOODS[m]) return;
      bus(m).gain.setTargetAtTime(1, ac.currentTime, 0.6);
      step = 0; next = ac.currentTime + 0.1;
      timer = setInterval(pump, 120); pump();
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* без сохранения */ }
      if (master && ac) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.1);
      return muted;
    },
    sfx(name) {
      if (!ac || muted) return;
      const t = ac.currentTime, out = master;
      if (name === 'paper') noise(out, t, 0.18, { vol: 0.22, hp: 1500, lp: 7000 });
      else if (name === 'stamp') { tone(out, t, 33, 0.35, { type: 'sine', vol: 0.6, lp: 250, atk: 0.003 }); noise(out, t, 0.12, { vol: 0.25, hp: 300, lp: 3000 }); }
      else if (name === 'tick') tone(out, t, 88, 0.05, { type: 'square', vol: 0.05, lp: 2500, atk: 0.001 });
    },
  };
}

return { createAudio };
})();
__m['ui/screens/title.js'] = (() => {
const { h, btn } = __m['ui/dom.js'];

function render(root, ctx) {
  const { game, caseData: c } = ctx;
  const started = game.state.started;
  root.append(h('section', { class: 'title-screen' },
    h('div', { class: 'paper case-file' },
      h('span', { class: 'stamp' }, 'Совершенно секретно'),
      h('img', { class: 'logo', src: 'assets/ui/logo-smilex.png', alt: 'Smilex' }),
      h('h1', { class: 'title', style: 'color:#1d1712;text-shadow:none' }, c.title),
      h('p', { class: 'hand' }, c.subtitle),
      h('div', { class: 'actions' },
        started ? btn('Продолжить расследование', () => ctx.go('board'), 'big') : null,
        btn(started ? 'Начать заново' : 'Новое дело', () => { if (started) game.reset(); ctx.go('intro'); }, started ? 'dark' : 'big'),
        btn('На весь экран', () => ctx.fullscreen(), 'dark')))));
}

return { render };
})();
__m['ui/screens/intro.js'] = (() => {
const { h, btn } = __m['ui/dom.js'];

function render(root, ctx) {
  const c = ctx.caseData;
  root.append(h('article', { class: 'paper story' },
    h('span', { class: 'stamp' }, 'Дело № 0417'),
    h('h1', {}, c.victim.name),
    h('p', { class: 'muted type' }, c.victim.role),
    ...c.intro.map((t) => h('p', {}, t)),
    h('h3', {}, 'Как играть'),
    h('ul', {}, ...c.rules.map((t) => h('li', {}, t))),
    h('div', { class: 'row', style: 'justify-content:flex-end' },
      btn('Начать расследование', () => { ctx.game.start(); ctx.audio.sfx('stamp'); ctx.go('board'); }, 'big'))));
}

return { render };
})();
__m['ui/components/cards.js'] = (() => {
const { h } = __m['ui/dom.js'];

function portrait(s, cls = '') {
  const img = h('img', { src: s.photo, alt: s.name, loading: 'lazy', class: cls });
  img.addEventListener('error', () => img.replaceWith(h('div', { class: 'avatar' }, s.name.slice(0, 1))));
  return img;
}

function suspectCard(s, { onclick, done } = {}) {
  return h(onclick ? 'button' : 'div', { class: 'polaroid', 'data-focus': onclick ? '' : null, type: onclick ? 'button' : null, onclick },
    portrait(s),
    h('div', { class: 'cap' }, h('b', {}, s.name), h('span', {}, s.role)),
    done ? h('span', { class: 'stamp done' }, 'допрошен') : null);
}

// Закрытая улика ничего не объясняет: ни названия, ни причины.
function clueCard(c, state, { onclick, index, cost }) {
  const r = ((index * 37) % 7 - 3) * 0.5;
  const title = state === 'locked' ? '🔒 Закрыто' : state === 'open' ? (c.label || 'Предмет') : c.title;
  const body = state === 'locked' ? 'Пока здесь ничего не видно.'
    : state === 'open' ? `Осмотреть · ${cost}` : c.text.length > 90 ? c.text.slice(0, 88) + '…' : c.text;
  return h('button', { class: `clue ${state}`, type: 'button', 'data-focus': '', style: `--r:${r}deg`, onclick }, h('b', {}, title), h('p', {}, body));
}

const minutes = (sec) => (sec % 60 === 0 ? `${sec / 60} мин` : `${sec} сек`);

return { portrait, suspectCard, clueCard, minutes };
})();
__m['ui/screens/board.js'] = (() => {
const { h } = __m['ui/dom.js'];
const { suspectCard } = __m['ui/components/cards.js'];

function render(root, ctx) {
  const { game, caseData: c } = ctx;
  const st = game.state;
  const found = st.found;
  const act = c.acts[st.act - 1];
  const askedBy = (s) => (st.log || []).some((x) => x.s === s.id);
  const recent = found.slice(-4).map((id) => c.clues.find((x) => x.id === id)).filter(Boolean);
  const puzzles = (c.puzzles || []).filter((p) => game.isUnlocked(p));

  root.append(h('section', { class: 'corkboard' },
    h('div', { class: 'act-banner' }, h('b', {}, act.title), h('span', {}, `улик: ${found.length} · загадок решено: ${st.solved.length}/${c.puzzles.length}`)),
    h('h2', {}, 'Подозреваемые'),
    h('div', { class: 'suspects' }, ...c.suspects.map((s) => suspectCard(s, { done: askedBy(s), onclick: () => ctx.go('interrogation', { id: s.id }) }))),
    h('h2', { style: 'margin-top:1.6rem' }, 'Места'),
    h('div', { class: 'places' }, ...c.locations.map((l) => {
      const open = l.act <= st.act;
      const all = c.clues.filter((x) => x.location === l.id && game.actOf(x) <= st.act);
      const got = all.filter((x) => found.includes(x.id)).length;
      return h('button', { class: 'folder' + (open ? '' : ' shut'), 'data-focus': '', type: 'button',
        onclick: () => (open ? ctx.go('location', { id: l.id }) : ctx.toast(`Откроется в акте ${l.act}`)) },
      h('span', { class: 'count' }, open ? `${got}/${all.length}` : '🔒'), h('b', {}, l.name), h('small', {}, open ? l.desc.split('.')[0] : `Откроется в акте ${l.act}`));
    })),
    puzzles.length ? h('h2', { style: 'margin-top:1.6rem' }, 'Загадки') : null,
    puzzles.length ? h('div', { class: 'places' }, ...puzzles.map((p) => {
      const solved = st.solved.includes(p.id);
      return h('button', { class: 'folder puzzle' + (solved ? ' solved' : ''), 'data-focus': '', type: 'button', onclick: () => ctx.go('puzzle', { id: p.id }) },
        h('span', { class: 'count' }, solved ? '✔' : '?'), h('b', {}, p.title), h('small', {}, solved ? 'решено' : 'ждёт ответа'));
    })) : null,
    recent.length ? h('h2', { style: 'margin-top:1.6rem' }, 'Последние находки') : null,
    recent.length ? h('div', { class: 'notes-strip' }, ...recent.map((cl, i) => h('div', { class: 'sticky', style: `--r:${[-3, 2, -1.5, 3][i]}deg` }, cl.title))) : null));
}

return { render };
})();
__m['ui/screens/location.js'] = (() => {
const { h, btn } = __m['ui/dom.js'];
const { clueCard, minutes } = __m['ui/components/cards.js'];

function showClue(ctx, clue, isNew) {
  ctx.modal(h('div', { class: 'paper sheet' },
    h('span', { class: 'stamp' }, isNew ? 'Новая улика' : 'Улика'),
    h('h2', {}, clue.title),
    h('p', { class: 'type' }, clue.text),
    h('div', { class: 'actions' }, btn('Дальше', () => ctx.closeModal()))));
}

function render(root, ctx, { id }) {
  const { game, caseData: c } = ctx;
  const loc = c.locations.find((l) => l.id === id);
  const list = c.clues.filter((x) => x.location === id && game.actOf(x) <= game.state.act);
  const grid = h('div', { class: 'clues' });
  const draw = () => {
    grid.replaceChildren(...list.map((cl, i) => {
      const found = game.state.found.includes(cl.id);
      const state = found ? 'found' : game.isUnlocked(cl) ? 'open' : 'locked';
      return clueCard(cl, state, { index: i, cost: minutes(game.costs.search), onclick: () => {
        if (state === 'locked') return ctx.toast('Здесь пока ничего не видно. Возможно, вы что-то упустили.');
        const r = game.search(cl.id);
        if (!r.ok) return;
        ctx.audio.sfx(state === 'open' ? 'stamp' : 'paper');
        showClue(ctx, cl, state === 'open');
        ctx.refreshBar();
        draw();
      } });
    }));
  };
  draw();
  root.append(
    h('div', { class: 'page-head' }, h('h1', { class: 'title', style: 'font-size:2.2rem' }, loc.name), h('span', { class: 'muted hand' }, loc.desc)),
    grid,
    h('div', { class: 'row', style: 'margin-top:1.5rem' }, btn('← На доску', () => ctx.go('board'), 'dark')));
}

return { showClue, render };
})();
__m['ui/screens/interrogation.js'] = (() => {
const { h, btn, fill } = __m['ui/dom.js'];
const { portrait, minutes } = __m['ui/components/cards.js'];

function render(root, ctx, { id }) {
  const { game, caseData: c } = ctx;
  const s = c.suspects.find((x) => x.id === id);
  const dialog = h('div', { class: 'dialog' });
  const qlist = h('div', { class: 'qlist' });

  const bubbles = (e) => [
    h('div', { class: 'bubble q' + (e.kind === 'c' ? ' show' : '') }, e.q),
    h('div', { class: 'bubble a paper' + (e.kind === 'c' && e.matched ? ' hit' : '') }, h('span', { class: 'who' }, s.name), e.a),
  ];
  const draw = () => {
    fill(dialog, ...game.state.log.filter((e) => e.s === s.id).flatMap(bubbles));
    const open = s.questions.filter((q) => !game.state.asked.includes(q.id) && game.isUnlocked(q));
    const locked = s.questions.filter((q) => !game.state.asked.includes(q.id) && !game.isUnlocked(q) && game.actOf(q) <= game.state.act).length;
    fill(qlist,
      ...open.map((q) => h('button', { class: 'qbtn', type: 'button', 'data-focus': '', onclick: () => ask(q) }, `— ${q.q}`, h('small', {}, ` ${minutes(game.costs.ask)}`))),
      locked ? h('div', { class: 'qbtn locked' }, `🔒 Ещё вопросов: ${locked}`) : null,
      h('button', { class: 'qbtn present', type: 'button', 'data-focus': '', onclick: pickClue }, '📎 Предъявить улику', h('small', {}, ` ${minutes(game.costs.confront)}`)));
  };
  const after = (before) => {
    ctx.audio.sfx('paper'); ctx.refreshBar(); draw();
    dialog.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const fresh = game.state.found.filter((x) => !before.has(x)).map((x) => c.clues.find((cl) => cl.id === x));
    if (fresh.length) ctx.toast('Новая улика: ' + fresh.map((f) => f.title).join(', '));
  };
  const ask = (q) => { const before = new Set(game.state.found); if (game.ask(s.id, q.id).ok) after(before); };
  const pickClue = () => {
    const mine = game.state.found.map((fid) => c.clues.find((x) => x.id === fid)).filter(Boolean);
    ctx.modal(h('div', { class: 'paper sheet' }, h('span', { class: 'stamp' }, 'Предъявить'),
      h('h2', {}, `Что показать: ${s.name}?`),
      mine.length ? h('div', { class: 'pick' }, ...mine.map((cl) => h('button', { class: 'chip', type: 'button', 'data-focus': '', onclick: () => {
        ctx.closeModal();
        const before = new Set(game.state.found);
        if (game.confront(s.id, cl.id).ok) after(before);
      } }, cl.title))) : h('p', { class: 'muted' }, 'У вас ещё нет улик.'),
      h('div', { class: 'actions' }, btn('Отмена', () => ctx.closeModal(), 'dark'))));
  };
  draw();

  root.append(h('div', { class: 'interro' },
    h('div', {},
      h('div', { class: 'polaroid' }, portrait(s), h('div', { class: 'cap' }, h('b', {}, s.name), h('span', {}, s.role))),
      h('p', { class: 'hand muted', style: 'margin-top:1rem' }, s.bio)),
    h('div', {},
      h('div', { class: 'page-head' }, h('h1', { class: 'title', style: 'font-size:2rem' }, 'Допрос')),
      dialog, qlist,
      h('div', { class: 'row', style: 'margin-top:1.4rem' }, btn('← На доску', () => ctx.go('board'), 'dark')))));
}

return { render };
})();
__m['ui/screens/notebook.js'] = (() => {
const { h, btn } = __m['ui/dom.js'];

function render(root, ctx) {
  const { game, caseData: c } = ctx;
  const found = game.state.found.map((id) => c.clues.find((x) => x.id === id)).filter(Boolean);
  const bySuspect = c.suspects.map((s) => ({ s, items: game.state.log.filter((e) => e.s === s.id) })).filter((x) => x.items.length);
  const ta = h('textarea', { 'data-focus': '', placeholder: 'Ваши версии, алиби, подозрения…', spellcheck: 'false' });
  ta.value = game.state.notes || '';
  ta.addEventListener('input', () => { game.state.notes = ta.value; game.save(); });
  root.append(h('div', { class: 'notebook' },
    h('section', { class: 'paper' }, h('h2', {}, `Улики (${found.length})`),
      found.length ? h('ul', { class: 'nb-list' }, ...found.map((cl) => h('li', {}, h('b', {}, cl.title), h('span', {}, cl.text))))
        : h('p', { class: 'muted' }, 'Пока пусто. Осмотрите места и допросите подозреваемых.')),
    h('section', { class: 'paper' }, h('h2', {}, 'Показания'),
      bySuspect.length ? h('ul', { class: 'nb-list' }, ...bySuspect.map(({ s, items }) =>
        h('li', {}, h('b', {}, `${s.name}, ${s.role}`), ...items.map((e) => h('span', { class: e.kind === 'c' ? 'conf' : '' }, `${e.kind === 'c' ? '📎 ' : '— '}${e.q}: «${e.a}»`)))))
        : h('p', { class: 'muted' }, 'Показаний пока нет. Допросите подозреваемых.')),
    h('section', { class: 'paper wide' }, h('h2', {}, 'Заметки команды'), h('div', { class: 'lines' }, ta))),
    h('div', { class: 'row', style: 'margin-top:1.5rem' }, btn('← На доску', () => ctx.go('board'), 'dark')));
}

return { render };
})();
__m['ui/screens/puzzle.js'] = (() => {
const { h, btn, fill } = __m['ui/dom.js'];
const { portrait, minutes } = __m['ui/components/cards.js'];

// Каждый builder возвращает { el, answer() } для своего типа загадки.
const builders = {
  code(p) {
    const input = h('input', { class: 'code-input', type: 'text', 'data-focus': '', placeholder: p.placeholder || '', autocomplete: 'off', spellcheck: 'false' });
    const alphabet = p.alphabet ? h('div', { class: 'alpha' }, ...[...p.alphabet].map((ch, i) => h('span', {}, h('b', {}, ch), h('i', {}, String(i + 1))))) : null;
    return { el: h('div', { class: 'code-box' }, alphabet, input), answer: () => input.value, input };
  },

  diff(p) {
    const picked = new Set();
    const rows = (p.lines || []).map((l) => {
      const row = h('button', { class: 'diff-row', type: 'button', 'data-focus': '', onclick: () => { picked.has(l.id) ? picked.delete(l.id) : picked.add(l.id); row.classList.toggle('on', picked.has(l.id)); } },
        h('span', { class: 'paper' }, l.a), h('span', { class: 'paper' }, l.b));
      return row;
    });
    return { el: h('div', { class: 'diff' }, h('div', { class: 'diff-head' }, h('b', {}, 'Версия 21:40'), h('b', {}, 'Версия 21:52')), ...rows), answer: () => [...picked] };
  },

  timeline(p, ctx) {
    const ans = {};
    const slot = p.slots[0];
    const rows = ctx.caseData.suspects.map((s) => {
      const key = `${s.id}|${slot.id}`;
      const b = h('button', { class: 'cycle', type: 'button', 'data-focus': '', onclick: () => {
        const i = p.places.findIndex((x) => x.id === ans[key]);
        ans[key] = i + 1 < p.places.length ? p.places[i + 1].id : undefined;
        b.textContent = p.places.find((x) => x.id === ans[key])?.name || '—';
        b.classList.toggle('set', !!ans[key]);
      } }, '—');
      return h('div', { class: 'tl-row' }, h('div', { class: 'tl-who' }, portrait(s), h('span', {}, s.name)), b);
    });
    return { el: h('div', { class: 'timeline' }, h('div', { class: 'tl-head' }, `Где был каждый в ${slot.label}? Нажимайте на кнопку, чтобы перебрать места.`), ...rows), answer: () => ans };
  },

  order(p) {
    let items = [...p.items];
    const list = h('ol', { class: 'order' });
    const draw = () => fill(list, ...items.map((it, i) => h('li', {}, h('span', { class: 'paper' }, it.text),
      h('button', { class: 'arrow', type: 'button', 'data-focus': '', disabled: i === 0 ? '' : null, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); list.children[i - 1]?.querySelector('.arrow')?.focus(); } }, '↑'),
      h('button', { class: 'arrow', type: 'button', 'data-focus': '', disabled: i === items.length - 1 ? '' : null, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); list.children[i + 1]?.querySelectorAll('.arrow')[1]?.focus(); } }, '↓'))));
    draw();
    return { el: list, answer: () => items.map((x) => x.id) };
  },
};

function render(root, ctx, { id }) {
  const { game, caseData: c } = ctx;
  const p = c.puzzles.find((x) => x.id === id);
  const built = builders[p.type](p, ctx);
  const result = h('div', { class: 'result' });
  const materials = (p.requires || []).map((rid) => c.clues.find((x) => x.id === rid)).filter((cl) => cl && game.state.found.includes(cl.id));
  const wrap = h('div', { class: 'puzzle' });

  const submit = () => {
    const r = game.solvePuzzle(p.id, built.answer());
    ctx.refreshBar();
    if (r.correct) {
      ctx.audio.sfx('stamp');
      showSolved();
      const news = (p.reward || []).map((rid) => c.clues.find((x) => x.id === rid)?.title).filter(Boolean);
      if (news.length) ctx.toast('Новая улика: ' + news.join(', '));
      if (r.advanced) ctx.actModal();
    } else {
      ctx.audio.sfx('paper');
      const detail = r.total ? ` Верно: ${r.right} из ${r.total}.` : '';
      fill(result, h('span', { class: 'stamp' }, 'Неверно'), h('p', {}, `Не сходится.${detail} Минус ${minutes(game.costs.wrong)}.`));
    }
  };
  const showSolved = () => {
    fill(wrap, h('div', { class: 'paper' }, h('span', { class: 'stamp ok' }, 'Решено'), h('p', { class: 'type' }, p.solved || 'Готово.')));
  };

  if (game.state.solved.includes(p.id)) showSolved();
  else fill(wrap,
    h('div', { class: 'paper' }, h('p', {}, p.intro)),
    materials.length ? h('div', { class: 'materials' }, ...materials.map((m) => h('div', { class: 'paper small' }, h('b', {}, m.title), h('p', { class: 'type' }, m.text)))) : null,
    built.el, result,
    h('div', { class: 'row', style: 'margin-top:1rem' }, btn('Ответить', submit, 'big'), btn('Открыть блокнот', () => ctx.go('notebook'), 'dark')));
  built.input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  root.append(h('div', { class: 'page-head' }, h('h1', { class: 'title', style: 'font-size:2.2rem' }, p.title)), wrap,
    h('div', { class: 'row', style: 'margin-top:1.5rem' }, btn('← На доску', () => ctx.go('board'), 'dark')));
}

return { render };
})();
__m['ui/screens/accuse.js'] = (() => {
const { h, btn, fill } = __m['ui/dom.js'];
const { portrait } = __m['ui/components/cards.js'];

function render(root, ctx) {
  const { game, caseData: c } = ctx;
  const pick = { killer: null, motive: null, method: null, keyClue: null };
  const mount = h('div', { class: 'accuse' });
  const chips = (kind, items, make) => h('div', { class: 'pick' }, ...items.map((it) => {
    const b = h('button', { class: 'chip' + (kind === 'killer' ? ' person' : ''), type: 'button', 'data-focus': '', onclick: () => { pick[kind] = it.id; draw(); } }, ...make(it));
    if (pick[kind] === it.id) b.classList.add('on');
    return b;
  }));
  const found = game.state.found.map((id) => c.clues.find((x) => x.id === id)).filter(Boolean);
  const attempts = () => Math.max(0, 2 - game.state.accusations);

  const draw = () => {
    const ready = pick.killer && pick.motive && pick.method && pick.keyClue;
    fill(mount,
      game.state.timeUp ? h('div', { class: 'paper' }, h('span', { class: 'stamp' }, 'Время вышло'), h('p', {}, 'Куранты бьют, а убийца ещё на свободе. Назовите виновного.')) : null,
      h('div', { class: 'paper' }, h('p', {}, `Попыток обвинить: ${attempts()}. Неверный убийца стоит 25 очков и одной попытки.`)),
      h('section', { class: 'paper' }, h('h2', {}, '1. Кто убийца?'), chips('killer', c.suspects, (s) => [portrait(s), `${s.name} · ${s.role}`])),
      h('section', { class: 'paper' }, h('h2', {}, '2. Мотив'), chips('motive', c.motives, (m) => [m.text])),
      h('section', { class: 'paper' }, h('h2', {}, '3. Орудие'), chips('method', c.methods, (m) => [m.text])),
      h('section', { class: 'paper' }, h('h2', {}, '4. Главная улика против убийцы'),
        found.length ? chips('keyClue', found, (cl) => [cl.title]) : h('p', { class: 'muted' }, 'У вас пока нет улик.')),
      h('div', { class: 'row' }, btn('Предъявить обвинение', () => confirmIt(), 'red big'), btn('← На доску', () => ctx.go('board'), 'dark')));
    if (!ready) mount.querySelector('.btn.red').setAttribute('disabled', '');
  };
  const confirmIt = () => {
    const s = c.suspects.find((x) => x.id === pick.killer);
    ctx.modal(h('div', { class: 'paper sheet' }, h('span', { class: 'stamp' }, 'Последний шанс'),
      h('h2', {}, `Обвинить: ${s.name}?`), h('p', {}, `Попыток останется: ${attempts() - 1}.`),
      h('div', { class: 'actions' }, btn('Подумать ещё', () => ctx.closeModal(), 'dark'), btn('Да, обвиняю', () => { ctx.closeModal(); verdict(); }, 'red'))));
  };
  const verdict = () => {
    const r = game.accuse(pick);
    ctx.refreshBar();
    const k = c.suspects.find((x) => x.id === c.answer.killer);
    const mine = c.suspects.find((x) => x.id === pick.killer);
    if (!r.final) {
      ctx.audio.sfx('paper');
      pick.killer = null;
      draw();
      return ctx.modal(h('div', { class: 'paper sheet' }, h('span', { class: 'stamp' }, 'Мимо'),
        h('h2', {}, `${mine.name} не убийца`), h('p', {}, 'Улики пока не сходятся. У вас осталась ещё одна попытка, и очки уже сняты.'),
        h('div', { class: 'actions' }, btn('Продолжить расследование', () => ctx.closeModal()))));
    }
    ctx.audio.setMood('finale'); ctx.audio.sfx('stamp');
    ctx.finished = true;
    fill(mount, h('section', { class: 'paper verdict' },
      h('span', { class: 'stamp' }, r.correct ? 'Дело закрыто' : 'Дело провалено'),
      h('h1', { class: 'title', style: 'color:#1d1712;font-size:2.4rem;text-shadow:none' }, r.correct ? `Убийца: ${k.name}!` : `Вы обвинили: ${mine.name}`),
      h('div', { class: 'score' }, `${r.score}/100`),
      h('p', {}, r.ending),
      !r.correct ? h('p', { class: 'type' }, `Настоящий убийца: ${k.name}.`) : null,
      h('p', { class: 'type' }, c.truth),
      h('p', { class: 'muted' }, `Мотив: ${r.motiveOk ? 'угадан' : 'нет'} · Орудие: ${r.methodOk ? 'угадано' : 'нет'} · Главная улика: ${r.keyOk ? 'верно' : 'нет'} · Подсказок: ${game.state.hintsUsed}`),
      h('div', { class: 'row', style: 'justify-content:center' }, btn('Сыграть снова', () => { game.reset(); ctx.finished = false; ctx.go('title'); }, 'big'))));
  };
  draw();
  root.append(h('div', { class: 'page-head' }, h('h1', { class: 'title', style: 'font-size:2.2rem' }, 'Обвинение')), mount);
}

return { render };
})();
;(async () => {
const { createGame } = __m['engine/game.js'];
const { localStorageAdapter } = __m['engine/storage.js'];
const { applyTheme } = __m['ui/theme.js'];
const { h, btn, fmtTime, fill } = __m['ui/dom.js'];
const { enableFocusNav } = __m['ui/focus.js'];
const { createAudio } = __m['audio/audio.js'];
const title = __m['ui/screens/title.js'];
const intro = __m['ui/screens/intro.js'];
const board = __m['ui/screens/board.js'];
const location = __m['ui/screens/location.js'];
const interrogation = __m['ui/screens/interrogation.js'];
const notebook = __m['ui/screens/notebook.js'];
const puzzle = __m['ui/screens/puzzle.js'];
const accuse = __m['ui/screens/accuse.js'];

const screens = { title, intro, board, location, interrogation, notebook, puzzle, accuse };
const MOODS = { title: 'investigate', intro: 'investigate', board: 'investigate', location: 'investigate', notebook: 'investigate', puzzle: 'interrogation', interrogation: 'interrogation', accuse: 'interrogation' };

applyTheme();
const caseData = {"id":"smilex-02","title":"Кто убил директора Smilex?","subtitle":"Новогодний корпоратив. Одно дело. Семь подозреваемых. Ни одной подсказки.","durationMin":90,"costs":{"search":30,"ask":45,"confront":60,"wrong":30},"victim":{"name":"Леонид Аркадьевич Бархатов","role":"Основатель и директор Smilex"},"intro":["28 декабря, 22:41. Бюро Smilex празднует Новый год: ёлка, караоке, шампанское и три незакрытых замечания экспертизы.","Охранник Семёныч заглянул в переговорную «Высотка» узнать, не выключить ли свет, и нашёл директора, Леонида Аркадьевича Бархатова. Рядом валялись перевёрнутый макет квартала «Берёзовая Роща» и вмятый алюминиевый тубус.","Завтра в 9:00 у Smilex презентация для инвесторов. Директор уже никому ничего не презентует.","Выходы закрыты, убийца ещё в здании. Игра ничего не подсказывает: ни кто врёт, ни какие улики нужны. Читайте, сравнивайте и ищите противоречия сами."],"rules":["Любое действие стоит времени: осмотр 30 секунд, вопрос 45 секунд, предъявление улики 1 минута, неверный ответ в загадке 30 секунд. Реальное время тоже идёт.","Улики можно предъявлять подозреваемым. Реагируют только на правильные.","Загадки открывают следующий акт. Всего три акта.","Записывайте показания в блокнот. Они сохраняются, и в них легко найти ложь.","Обвинить можно дважды. Для полного результата назовите убийцу, мотив, орудие и главную улику."],"acts":[{"id":"a1","title":"Акт I. Место преступления","goal":"p_laptop","intro":"Осмотрите «Высотку», кабинет директора и зал. Пока не вскроете его ноутбук, дальше вас не пустят."},{"id":"a2","title":"Акт II. Алиби","goal":"p_timeline","intro":"Открылись серверная, BIM-комната, архбюро и ресепшн. Выясните, кто где был в минуту удара. Не всё, что кажется алиби, им является."},{"id":"a3","title":"Акт III. Второе дно","goal":"p_order","intro":"Всё, что вы нашли, лежит на поверхности. Теперь соберите события вечера в единую последовательность."}],"suspects":[{"id":"ivan","name":"Иван","role":"Эксперт по разделу «Генплан»","gender":"m","photo":"assets/people/ivan.webp","bio":"Знает, где в городе можно ставить дома, а где нельзя. Лучше бы не знал: замечания экспертизы приходят ему лично.","deflect":"Не мой вопрос, коллеги.","questions":[{"id":"ivan_q1","q":"Где вы были в 22:00?","a":"Сидел за столом с оливье и никуда не отходил. Ни на шаг. Хоть спросите оливье."},{"id":"ivan_q2","q":"Какие у вас отношения с директором?","a":"Рабочие. Он требовал уложиться в нормативы по парковкам, а я их не придумываю. Но убивать? Только письменно возражать."},{"id":"ivan_q3","q":"Что говорили о презентации?","act":2,"a":"Что директор хочет подать все фасады как «своё». Архитекторы кипели молча, а это самое опасное."}],"confrontations":[{"id":"ivan_c1","clue":"c_cam","a":"Ладно, бегал к машине за шампанским: двадцать минут туда-обратно. И ещё звонил по одному делу, но это не про убийство.","unlocks":["c_ivan_call"]},{"id":"ivan_c2","clue":"c_tube","a":"Мой тубус зелёный и подписан «Генплан forever». Эта наклейка про BIM, не про нас."}]},{"id":"alesya","name":"Алеся","role":"ГИП","gender":"f","photo":"assets/people/alesya.webp","bio":"Главный инженер проекта: держит в голове сроки, смежников и три версии одного чертежа. Умеет спокойно говорить «это не мой раздел».","deflect":"Не понимаю, при чём тут это.","questions":[{"id":"alesya_q1","q":"Вы заходили в переговорную «Высотка»?","a":"Нет, конечно. Я весь вечер на кухне: кофе, оливье, пара звонков."},{"id":"alesya_q2","q":"Как вам приказ о передаче проекта Паше?","requires":["c_order"],"a":"Он обещал вернуть. Я ему кофе носила, а не мстила."},{"id":"alesya_q3","q":"Чем вы занимались в 22:14?","act":2,"requires":["c_coffee"],"a":"Кофе брала. Дважды. Организм работает, а директор нет."}],"confrontations":[{"id":"alesya_c1","clue":"c_cup","a":"Хорошо: заходила в 21:45 с кофе. Он был живой и довольный и сказал, что ждёт архитекторов по фасадам, надо «кое-что сообщить». К 21:50 я вышла.","unlocks":["c_architects_wait"]},{"id":"alesya_c2","clue":"c_order","a":"Я не против, что проект у Паши. Я против, что узнала из приказа, а не от человека."}]},{"id":"marina","name":"Марина","role":"BIM-менеджер","gender":"f","photo":"assets/people/marina.webp","bio":"Хранитель модели «Берёзовая Роща». Знает, где лежит каждый .rvt, и где он лежал раньше.","deflect":"Это к модели не относится.","questions":[{"id":"marina_q1","q":"Что вы делали вечером?","a":"Сидела в серверной, проверяла бэкапы. Всё штатно, всё сохраняется, модель в полном порядке."},{"id":"marina_q2","q":"Директор что-нибудь требовал от вас?","requires":["c_email"],"a":"Просил модель к девяти утра. Это нормальный рабочий запрос, какие тут мотивы."},{"id":"marina_q3","q":"Что на экране вашего ноутбука в серверной?","act":2,"requires":["c_server_cam"],"a":"Это моя личная работа. Не лезьте в чужой ноутбук."}],"confrontations":[{"id":"marina_c1","clue":"c_backup","a":"Ладно... модель пропала в сентябре. Я три месяца пыталась её восстановить, пока он не узнал. Поэтому и торчала в серверной весь вечер.","unlocks":["c_marina_restore"]},{"id":"marina_c2","clue":"c_server_cam","a":"Видите? Я там, как приклеенная. Восстановление дошло до 58%. До ста ещё далеко."},{"id":"marina_c3","clue":"c_email","a":"Это письмо я отправила честно. Я правда надеялась успеть."}]},{"id":"alla","name":"Алла","role":"Архитектор","gender":"f","photo":"assets/people/alla.webp","bio":"Рисует фасады, которые сначала любят все, потом никто, потом снова все. Режиссёр всех корпоративных караоке.","deflect":"Я не по этой части.","questions":[{"id":"alla_q1","q":"Где вы были в 22:00?","a":"В караоке. «Ой, мороз, мороз» исполнила три раза подряд, спросите у соседей, они ещё не оглохли."},{"id":"alla_q2","q":"Вы работали над фасадами «Рощи»?","a":"Моя концепция. Два месяца не вылезала из моделей, и она выиграла у инвестора три сомнения."},{"id":"alla_q3","q":"Директор хотел подписаться как автор?","act":2,"requires":["c_slide"],"a":"Ну... он собирался подать фасады как «концепцию Smilex». Нам сказали «потом поговорим»."}],"confrontations":[{"id":"alla_c1","clue":"c_karaoke_video","a":"Вот я, красота. Видите? Три песни, три раза."},{"id":"alla_c2","clue":"c_queue","a":"Ну, слот пропустила: бегала поправить макияж. Минут пять, не больше. Ну и что?","unlocks":["c_alla_gap"]},{"id":"alla_c3","clue":"c_photo_zoom","a":"Это моя шапка. Сняла, душно было."},{"id":"alla_c4","clue":"c_mark","a":"Вмятина на столе? Я не по мебели."},{"id":"alla_c5","clue":"c_ficus","a":"...Я хотела только поговорить. Он смеялся, сказал, что автор тот, кто подписывает смету. Я схватила этот проклятый Кирпич. Я не хотела.","unlocks":["c_confession"]}]},{"id":"pasha","name":"Паша","role":"ГИП","gender":"m","photo":"assets/people/pasha.webp","bio":"Второй ГИП бюро. Смеётся громче всех, считает быстрее всех и заметно чаще всех попадает в кадр.","deflect":"Я тут ни при чём.","questions":[{"id":"pasha_q1","q":"Где вы были в момент убийства?","a":"У ёлки: там была фотосессия. Фотограф меня уже хочет в штат."},{"id":"pasha_q2","q":"Вам передали проект Алеси. Совпадение?","requires":["c_order"],"a":"Я сам попросил директора: «возьми меня на Рощу». Он согласился. Убивать, правда, не собирался: проект только в шоколаде."}],"confrontations":[{"id":"pasha_c1","clue":"c_photo","a":"Видите, я на каждом кадре! Даже на селфи с Дедом Морозом. Алиби такое, что хоть в рамку."},{"id":"pasha_c2","clue":"c_queue","a":"Помню, все ждали вторую песню, повернулись к сцене, а там пусто, только шапка. Потом Алла выскочила и допела.","unlocks":["c_pasha_witness"]}]},{"id":"artem","name":"Артём","role":"BIM-менеджер","gender":"m","photo":"assets/people/artem.webp","bio":"Тоже BIM-менеджер: чинит чужие модели и ест над ними булки. Любит порядок в Revit и хаос в обеденном перерыве.","deflect":"Не про меня, я в модели.","questions":[{"id":"artem_q1","q":"Где вы были в 22:00?","a":"В BIM-комнате. Закрывал замечания. Teams всё запомнил."},{"id":"artem_q2","q":"Что вы знаете о состоянии модели?","act":2,"requires":["c_backup"],"a":"Про бэкап ничего не знал. Я работаю на станции №1, станция №2 — Маринина."},{"id":"artem_q3","q":"О чём вы спорили с Мариной?","act":2,"requires":["c_ws2"],"a":"О том, кто отключил бэкап. Она сказала «не при всех». Теперь понимаю почему."}],"confrontations":[{"id":"artem_c1","clue":"c_teams","a":"Сообщения мои, я всё время на месте. Можно даже сверить орфографию."},{"id":"artem_c2","clue":"c_tube","a":"Такая наклейка у каждого BIM-менеджера. Мой тубус в шкафу, проверьте."}]},{"id":"ksyusha","name":"Ксюша","role":"Архитектор","gender":"f","photo":"assets/people/ksyusha.webp","bio":"Архитектор с тихим характером и громкими фасадами. Если Ксюша молчит, значит, она уже придумала три концепции.","deflect":"Я ничего не знаю, мне домой.","questions":[{"id":"ksyusha_q1","q":"Когда вы ушли с корпоратива?","a":"В 22:05. Дома кот, он не любит ждать и умеет смотреть осуждающе."},{"id":"ksyusha_q2","q":"Что вы знали о презентации?","a":"Директор сказал, что хочет поговорить с нами обеими по фасадам: с Аллой в 21:40, а меня звал после банкета."},{"id":"ksyusha_q3","q":"Видели что-нибудь перед уходом?","act":2,"requires":["c_exit"],"a":"Алла стояла у сцены и была нервной. Сказала, что директор собирался «сделать из нас массовку»."}],"confrontations":[{"id":"ksyusha_c1","clue":"c_board","a":"Это про угол крыши, не про директора."},{"id":"ksyusha_c2","clue":"c_exit","a":"Вот такси, вот время. Все вопросы к коту."}]}],"locations":[{"id":"boardroom","name":"Переговорная «Высотка»","act":1,"desc":"Место преступления: окна на высотку, перевёрнутый макет и тишина, которую не хочется нарушать."},{"id":"office","name":"Кабинет директора","act":1,"desc":"Кожаное кресло, ежедневник и кораблик на полке. Пахнет кофе и строгими решениями."},{"id":"party","name":"Зал корпоратива","act":1,"desc":"Ёлка, караоке, кофемашина и тарелка оливье, которая видела всё."},{"id":"server","name":"Серверная","act":2,"desc":"Гудящие шкафы и мигающие огоньки. Здесь хранят всё, что нельзя потерять, и иногда теряют."},{"id":"bim","name":"BIM-комната","act":2,"desc":"Две рабочие станции, много мониторов, одна общая кружка."},{"id":"studio","name":"Архбюро","act":2,"desc":"Макеты, доски с эскизами и фикус, который слышал слишком много споров о фасадах."},{"id":"lobby","name":"Ресепшн и парковка","act":2,"desc":"Турникеты, журнал охраны и камеры. Здесь ничего не скрыть, но кое-что можно не заметить."}],"clues":[{"id":"c_clock","label":"Часы на столе","title":"Остановившиеся часы","location":"boardroom","requires":[],"text":"Настольные часы упали и разбились. Стрелки остановились на 22:14."},{"id":"c_tube","label":"Тубус на полу","title":"Вмятый тубус","location":"boardroom","requires":[],"text":"Алюминиевый тубус с вмятиной на конце, на крышке наклейка «BIM спасёт мир». Вмятина старая, покрыта пылью: тубус годами падал со шкафа."},{"id":"c_cup","label":"Чашка","title":"Чашка с помадой","location":"boardroom","requires":[],"text":"Недопитый кофе. На чашке отпечаток помады цвета «вишня»."},{"id":"c_mark","label":"Стол","title":"Вмятина на столешнице","location":"boardroom","requires":[],"text":"На столе свежая вмятина с пятью гранями: след основания тяжёлого предмета. В ней крошки золотой краски."},{"id":"c_laptop","label":"Ноутбук директора","title":"Заблокированный ноутбук","location":"boardroom","requires":[],"text":"Экран блокировки. Подсказка: «Первые сваи Рощи: ДДММ». Нужен четырёхзначный код."},{"id":"c_model","label":"Макет","title":"Опрокинутый макет","location":"boardroom","requires":[],"text":"Макет «Берёзовая Роща» перевёрнут. Табличка на фасадном блоке №3 с надписью «Автор:» отодрана."},{"id":"c_calendar","label":"Календарь на столе","title":"Настольный календарь","location":"office","requires":[],"text":"14 марта обведено красным: «СВАИ!!! (обмыли)»."},{"id":"c_diary","label":"Ежедневник","title":"Ежедневник директора","location":"office","requires":[],"text":"28.12: «21:30 Высотка, презентация. 21:40 А. по фасадам. Ф. после банкета». На полях: «Записки пишу по-старому, сдвиг на 3»."},{"id":"c_shelf","label":"Полка","title":"Полка наград","location":"office","requires":[],"text":"На полке пустое место с круглым следом от основания. Табличка: «Золотой Кирпич: лучшему архитектору года»."},{"id":"c_order","label":"Бумаги на столе","title":"Приказ о передаче проекта","location":"office","requires":[],"text":"Приказ: проект «Берёзовая Роща» передать от ГИП Алеси ГИП Паше. Подпись директора, дата вчерашняя."},{"id":"c_letter","label":"Письмо на столе","title":"Письмо экспертизы","location":"office","requires":[],"text":"Замечания экспертизы к разделу «Генплан»: три мелких, исправимых."},{"id":"c_note","label":"Записка под клавиатурой","title":"Записка шифром","location":"office","requires":["c_diary"],"text":"Записка директора, две строки: «ГЕХСУ ХСОЯНС В» и «ЛПИРГ ЦДУГХЯ»."},{"id":"c_photo","label":"Фотографии с ёлки","title":"Фотосессия у ёлки","location":"party","requires":[],"text":"Фотограф сделал серию снимков с таймкодами 21:55–22:25. Паша на каждом кадре: то с Дедом Морозом, то с гирляндой на голове."},{"id":"c_karaoke_video","label":"Видео с караоке","title":"Запись караоке","location":"party","requires":[],"text":"Запись склеена из трёх клипов, где Алла поёт «Ой, мороз». Таймкод виден только у первого: 22:00. У остальных он стёрт при монтаже."},{"id":"c_coffee","label":"Кофемашина","title":"Чеки кофемашины","location":"party","requires":[],"text":"Два чека на карту Алеси: «двойной эспрессо» в 22:12 и «капучино» в 22:16."},{"id":"c_photo_zoom","label":"Фотографии, ещё раз","title":"Кадр 22:14","location":"party","act":2,"requires":["c_clock","c_photo"],"text":"Увеличение кадра с таймкодом 22:14: на заднем плане пустая сцена, микрофон лежит на колонке, рядом шапка с помпоном, в которой пела Алла. Исполнителя нет."},{"id":"c_queue","label":"Терминал очереди","title":"Очередь караоке","location":"party","act":2,"requires":["c_karaoke_video"],"text":"Алла, «Ой, мороз»: 22:00 исполнено. Алла, «Ой, мороз 2»: 22:13 пропущено, исполнитель не вышел. Алла, «Ой, мороз 3»: 22:20 исполнено."},{"id":"c_server_cam","label":"Видео серверной","title":"Запись камеры серверной","location":"server","requires":[],"text":"С 22:00 до 22:20 Марина у стойки с ноутбуком. На экране полоса восстановления файла: за двадцать минут с 40% до 58%."},{"id":"c_server_door","label":"Журнал серверной","title":"Журнал входа в серверную","location":"server","requires":[],"text":"Карта Марины: вход в 21:58, выход в 22:21. Других посетителей нет."},{"id":"c_backup","label":"Журнал бэкапа","title":"Журнал резервного копирования","location":"server","requires":[],"text":"С 14 сентября задача бэкапа модели «Берёзовая Роща» завершалась ошибкой, затем её отключил BIM_admin. Последняя рабочая версия модели от 14 сентября."},{"id":"c_teams","label":"Станция №1","title":"Чат Teams на станции №1","location":"bim","requires":[],"text":"Артём отправил сообщения инженерам: в 22:10, 22:14 и 22:17, без пауз в работе."},{"id":"c_ws2","label":"Станция №2","title":"Рабочая станция №2","location":"bim","requires":["c_backup"],"text":"На экране окно «Восстановление из корзины». Файл модели удалён 14 сентября, поверх лежит пустая заглушка «ФИНАЛ_3». На мониторе стикер «Не трогать!» от Марины."},{"id":"c_mug","label":"Кружка","title":"Кружка «Лучший BIM-менеджер»","location":"bim","requires":[],"text":"Одна кружка на двоих, с трещиной. Ручка заклеена скотчем."},{"id":"c_board","label":"Доска с фасадами","title":"Доска фасадов","location":"studio","requires":[],"text":"Две концепции фасада, Аллы и Ксюши, и подписи «НЕТ!» и «Сама ты НЕТ!»."},{"id":"c_hippo","label":"Стойка с тубусами","title":"Тубусы с бегемотиками","location":"studio","requires":[],"text":"У каждого тубуса архитекторов нарисован бегемотик. Ни одного с наклейкой BIM."},{"id":"c_printouts","label":"Лоток принтера","title":"Две распечатки слайда 4","location":"studio","act":2,"requires":[],"text":"Две версии слайда 4 «Авторство». Первая от 21:40, вторая от 21:52. Они выглядят почти одинаково."},{"id":"c_ficus","label":"Фикус в кадке","title":"Статуэтка в кадке","location":"studio","act":3,"requires":["c_mark","c_shelf"],"text":"Под фикусом в земле вымытая золотая статуэтка «Золотой Кирпич». В гранях основания остались крошки золотой краски, на постаменте царапина."},{"id":"c_cam","label":"Камеры парковки","title":"Запись камеры парковки","location":"lobby","requires":[],"text":"Иван выходит на парковку в 22:00, возвращается в 22:20 с бутылкой шампанского. В 22:14 он стоит у машины."},{"id":"c_exit","label":"Журнал выхода","title":"Журнал выхода сотрудников","location":"lobby","requires":[],"text":"Пропуск Ксюши: выход в 22:05, повторного входа нет."},{"id":"c_guard","label":"Охранник Семёныч","title":"Показания Семёныча","location":"lobby","requires":[],"text":"Семёныч слышал глухой удар около 22:14, но решил, что это ёлка. А минут через шесть в зале снова запели «Ой, мороз»."},{"id":"c_door","label":"Дверь Высотки","title":"Дверь «Высотки»","location":"lobby","requires":[],"text":"Дверь «Высотки» весь вечер подпёрта пенопластовым клином, карты не применялись. В переговорную мог зайти кто угодно."},{"id":"c_slide","title":"Слайд «Авторы» (21:52)","location":null,"requires":[],"text":"Слайд 4 презентации: «Автор концепции фасадов: Л. А. Бархатов». Последнее изменение в 21:52."},{"id":"c_email","title":"Письмо Марины директору","location":null,"requires":[],"text":"Письмо Марины от 28.12: «Леонид Аркадьевич, модель к 9 утра будет, честное слово»."},{"id":"c_ivan_call","title":"Звонок Ивана","location":null,"requires":[],"text":"Иван звонил по поводу работы в другой девелоперской компании. К убийству это отношения не имеет."},{"id":"c_architects_wait","title":"Директор ждал архитекторов","location":null,"requires":[],"text":"По словам Алеси, в 21:45 директор сказал, что ждёт архитекторов по фасадам и хочет сообщить что-то важное."},{"id":"c_marina_restore","title":"Марина восстанавливала модель","location":null,"requires":[],"text":"Марина призналась: модель пропала в сентябре, и все три месяца она пыталась её вернуть. Мотив есть, но вечером она стояла у стойки."},{"id":"c_alla_gap","title":"Алла отлучалась","location":null,"requires":[],"text":"Алла призналась, что в 22:13 покидала сцену «на пять минут»."},{"id":"c_pasha_witness","title":"Паша заметил пустую сцену","location":null,"requires":[],"text":"Паша подтвердил: когда пришла очередь второй песни, на сцене было пусто, только шапка лежала."},{"id":"c_note_decoded","title":"Записка директора","location":null,"requires":[],"text":"Расшифровка: «Автор только я. Имена убрать». Директор собирался стереть имена архитекторов."},{"id":"c_diff_result","title":"Что изменилось в слайде","location":null,"requires":[],"text":"Во второй версии заменены авторы фасадов (теперь только директор), руководитель проекта (Паша вместо Алеси) и добавлено «без архитекторов» в строке про презентацию."},{"id":"c_reconstruction","title":"Реконструкция вечера","location":null,"requires":[],"text":"Вечер сложился по минутам. В 22:13 Алла покинула сцену, в 22:14 в «Высотке» остановились часы, в 22:20 она вернулась и допела песню."},{"id":"c_confession","title":"Признание","location":null,"requires":[],"text":"Алла призналась. Дело можно закрывать, но вы ещё должны назвать мотив, орудие и главную улику."}],"puzzles":[{"id":"p_laptop","type":"code","act":1,"requires":["c_laptop"],"title":"Ноутбук директора","intro":"Экран блокировки просит четыре цифры. Подсказка на экране есть, но она не отвечает на вопрос сама.","placeholder":"ДДММ","solution":["1403"],"reward":["c_slide","c_email"],"solved":"Ноутбук открыт. Слайд 4, последние изменения и письма стали доступны."},{"id":"p_cipher","type":"code","act":1,"requires":["c_note"],"title":"Записка шифром","intro":"Две строки, зашифрованные по-старому. Чтобы расшифровать, введите обе строки через пробел.","placeholder":"первая строка вторая строка","alphabet":"АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ","solution":["автор только я имена убрать","автортолькояименаубрать"],"reward":["c_note_decoded"],"solved":"Записка директора расшифрована."},{"id":"p_timeline","type":"timeline","act":2,"requires":[],"title":"Таймлайн: 22:14","intro":"Отметьте, где был каждый подозреваемый в минуту, когда остановились часы. Если улики не подтверждают место, оставьте «не установлено». Один ответ из семи именно такой.","slots":[{"id":"1","label":"22:14"}],"places":[{"id":"hall","name":"Зал"},{"id":"kitchen","name":"Кухня"},{"id":"boardroom","name":"«Высотка»"},{"id":"bim","name":"BIM-комната"},{"id":"server","name":"Серверная"},{"id":"parking","name":"Парковка"},{"id":"studio","name":"Архбюро"},{"id":"home","name":"Дома"},{"id":"unknown","name":"Не установлено"}],"solution":{"ivan|1":"parking","alesya|1":"kitchen","marina|1":"server","artem|1":"bim","pasha|1":"hall","ksyusha|1":"home","alla|1":["unknown","boardroom"]},"solved":"Таймлайн сходится. Открылся третий акт."},{"id":"p_versions","type":"diff","act":3,"requires":["c_printouts"],"title":"Две версии слайда","intro":"Отметьте строки, которые различаются между версией от 21:40 и версией от 21:52.","lines":[{"id":"l1","a":"Проект: «Берёзовая Роща», 3 корпуса, 12 этажей","b":"Проект: «Берёзовая Роща», 3 корпуса, 12 этажей"},{"id":"l2","a":"Фасады: авторы Алла, Ксюша","b":"Фасады: автор Л. А. Бархатов"},{"id":"l3","a":"Генплан: эксперт Иван, согласован","b":"Генплан: эксперт Иван, согласован"},{"id":"l4","a":"Руководитель проекта: Алеся","b":"Руководитель проекта: Паша"},{"id":"l5","a":"BIM-модель: ФИНАЛ_3 (Марина, Артём)","b":"BIM-модель: ФИНАЛ_3 (Марина, Артём)"},{"id":"l6","a":"Презентация: 29 декабря, 9:00","b":"Презентация: 29 декабря, 9:00, без архитекторов"}],"solution":["l2","l4","l6"],"reward":["c_diff_result"],"solved":"Различия найдены."},{"id":"p_order","type":"order","act":3,"requires":["c_clock"],"title":"Реконструкция вечера","intro":"Расставьте события в правильном порядке по времени. Некоторые детали у вас должны быть в блокноте.","items":[{"id":"e6","text":"Удар в «Высотке», часы останавливаются"},{"id":"e2","text":"Алеся приносит директору кофе"},{"id":"e8","text":"Семёныч находит директора"},{"id":"e4","text":"Алла выходит на сцену, первая песня"},{"id":"e1","text":"Директор уходит в «Высотку» готовить презентацию"},{"id":"e7","text":"Алла возвращается и поёт в третий раз"},{"id":"e3","text":"Директор стирает имена авторов из презентации"},{"id":"e5","text":"Алла пропускает свой слот, исполнитель не вышел"}],"solution":["e1","e2","e3","e4","e5","e6","e7","e8"],"reward":["c_reconstruction"],"solved":"Последовательность найдена. Теперь можно обвинять."}],"hints":["Часы остановились в 22:14. Именно эту минуту проверяйте по алиби у каждого.","Алиби Ивана, Алеси, Паши, Артёма и Марины подтверждаются записями. Сравните, чьё алиби держится только на словах и склеенном видео.","Запись караоке склеена из трёх клипов. Очередь в терминале и кадр с таймкодом помогут понять, что в 22:13 происходило на сцене.","Вмятина на столе пятигранная, в ней золотая краска. На полке в кабинете пустое место. Что стояло на нём?","Если вам кажется, что убийца Марина, посмотрите ещё раз: у неё мотив, но видео её алиби не склеено."],"motives":[{"id":"m_exam","text":"Сорванная экспертиза Генплана"},{"id":"m_rival","text":"Борьба двух ГИПов за один проект"},{"id":"m_authorship","text":"Присвоение авторства фасадов"},{"id":"m_model","text":"Скрыть пропажу BIM-модели перед инвесторами"},{"id":"m_job","text":"Уход в другую компанию с тайнами проекта"}],"methods":[{"id":"x_tube","text":"Тубус для чертежей"},{"id":"x_award","text":"Статуэтка «Золотой Кирпич»"},{"id":"x_model","text":"Макет «Берёзовая Роща»"},{"id":"x_laptop","text":"Ноутбук директора"}],"solutionClues":["c_clock","c_photo","c_photo_zoom","c_queue","c_mark","c_shelf","c_ficus"],"answer":{"killer":"alla","motive":"m_authorship","method":"x_award","keyClues":["c_photo_zoom","c_queue"]},"truth":"Алла два месяца делала фасады «Берёзовой Рощи». В 21:52 директор стёр её имя и имя Ксюши из презентации, а в 21:40 Алла уже знала, что её ждёт «серьёзный разговор». Её алиби в караоке держалось на склеенном видео: в 22:13 Алла пропустила свой слот, поднялась в «Высотку» «поговорить», и в ярости ударила директора «Золотым Кирпичом», который он принёс на стол для эффекта. В 22:14 часы остановились. Статуэтку Алла вымыла и закопала под фикусом, а в 22:20 вернулась на сцену допеть. Марина и Иван тоже скрывали секреты, но к убийству они не причастны.","endings":{"win":"Дело раскрыто! Алла призналась: «Я хотела только поговорить». Директор получил по заслугам, а презентация инвесторам переносится. Smilex объявляет конкурс на лучшую систему авторства, а Семёныч получает премию и оливье.","lose":"Вы ошиблись: убийца ускользнул под бой курантов. Расследование придётся продолжить после праздников, а директору всё равно: он уже не презентует."}};
const game = createGame(caseData, localStorageAdapter(`smilex-quest-${caseData.id}`));
const audio = createAudio();
const main = document.getElementById('main');
const bar = document.getElementById('bar');
const layer = document.getElementById('layer');
const history = [];
let current = null;
let timerEl = null;

const ctx = {
  game, caseData, audio, finished: false,
  go(name, params = {}, { push = true } = {}) {
    if (push && current) history.push(current);
    current = { name, params };
    ctx.closeModal();
    main.replaceChildren();
    main.scrollTop = 0;
    screens[name].render(main, ctx, params);
    renderBar(name);
    audio.setMood(ctx.finished ? 'finale' : MOODS[name] || 'investigate');
    requestAnimationFrame(() => main.querySelector('[data-focus]')?.focus({ preventScroll: true }));
    if (name === 'board') ctx.checkAct();
  },
  back() {
    if (layer.querySelector('.modal')) return ctx.closeModal();
    const prev = history.pop();
    if (prev) ctx.go(prev.name, prev.params, { push: false });
  },
  modal(el) {
    layer.querySelector('.modal')?.remove();
    layer.append(h('div', { class: 'modal', onclick: (e) => { if (e.target.classList.contains('modal')) ctx.closeModal(); } }, el));
    requestAnimationFrame(() => (el.querySelector('[data-focus]') || el).focus?.({ preventScroll: true }));
  },
  closeModal() { layer.querySelector('.modal')?.remove(); },
  toast(text) { const t = h('div', { class: 'toast' }, text); document.body.append(t); setTimeout(() => t.remove(), 3300); },
  fullscreen() { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {}); },
  refreshBar() { if (timerEl) { timerEl.textContent = fmtTime(game.state.secondsLeft); timerEl.classList.toggle('low', game.state.secondsLeft <= 600); } },
  actModal() {
    const st = game.state, act = caseData.acts[st.act - 1];
    st.seenAct = st.act; game.save();
    audio.sfx('stamp');
    ctx.modal(h('div', { class: 'paper sheet' }, h('span', { class: 'stamp' }, 'Новый акт'), h('h2', {}, act.title), h('p', {}, act.intro),
      h('div', { class: 'actions' }, btn('Вперёд', () => ctx.closeModal()))));
  },
  checkAct() { if (game.state.started && (game.state.seenAct || 0) < game.state.act) ctx.actModal(); },
};

function renderBar(name) {
  if (name === 'title') { fill(bar); timerEl = null; return; }
  timerEl = h('div', { class: 'timer' }, fmtTime(game.state.secondsLeft));
  const inGame = name !== 'intro';
  fill(bar,
    h('img', { class: 'logo', src: 'assets/ui/logo-smilex-wide.png', alt: 'Smilex' }),
    h('div', { class: 'spacer' }),
    inGame ? btn('Доска', () => ctx.go('board'), 'dark') : null,
    inGame ? btn('Блокнот', () => ctx.go('notebook'), 'dark') : null,
    inGame ? btn('Подсказка', () => {
      const t = game.hint();
      audio.sfx('paper');
      ctx.modal(h('div', { class: 'paper sheet' }, h('span', { class: 'stamp' }, 'Подсказка'),
        h('p', {}, t ?? 'Подсказки закончились. Дальше только вы.'), t ? h('p', { class: 'muted' }, 'Итоговая оценка снижена на 5 очков.') : null,
        h('div', { class: 'actions' }, btn('Понятно', () => ctx.closeModal()))));
    }, 'dark') : null,
    inGame && name !== 'accuse' ? btn('Обвинить', () => ctx.go('accuse'), 'red') : null,
    btn(audio.muted ? '🔇' : '🔊', (e) => { e.currentTarget.textContent = audio.toggleMute() ? '🔇' : '🔊'; }, 'dark'),
    timerEl);
  ctx.refreshBar();
}

setInterval(() => {
  if (!game.state.started || ctx.finished || !timerEl) return;
  const was = game.state.timeUp;
  game.tick(1);
  ctx.refreshBar();
  if (!was && game.state.timeUp) { ctx.toast('Время вышло. Назовите убийцу.'); ctx.go('accuse'); }
}, 1000);

enableFocusNav({ scopeFn: () => (layer.querySelector('.modal') || document.getElementById('app')), onBack: () => ctx.back() });
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('keydown', () => audio.unlock(), { once: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__ctx = ctx;
ctx.go('title', {}, { push: false });

})();
})();

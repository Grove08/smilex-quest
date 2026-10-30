import { createGame } from './engine/game.js';
import { localStorageAdapter } from './engine/storage.js';
import { applyTheme } from './ui/theme.js';
import { h, btn, fmtTime, fill } from './ui/dom.js';
import { enableFocusNav } from './ui/focus.js';
import { createAudio } from './audio/audio.js';
import * as title from './ui/screens/title.js';
import * as intro from './ui/screens/intro.js';
import * as board from './ui/screens/board.js';
import * as location from './ui/screens/location.js';
import * as interrogation from './ui/screens/interrogation.js';
import * as notebook from './ui/screens/notebook.js';
import * as puzzle from './ui/screens/puzzle.js';
import * as accuse from './ui/screens/accuse.js';

const screens = { title, intro, board, location, interrogation, notebook, puzzle, accuse };
const MOODS = { title: 'investigate', intro: 'investigate', board: 'investigate', location: 'investigate', notebook: 'investigate', puzzle: 'interrogation', interrogation: 'interrogation', accuse: 'interrogation' };

applyTheme();
const caseData = await (await fetch('cases/smilex.json')).json();
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

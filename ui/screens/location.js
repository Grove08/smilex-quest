import { h, btn } from '../dom.js';
import { clueCard, minutes } from '../components/cards.js';

export function showClue(ctx, clue, isNew) {
  ctx.modal(h('div', { class: 'paper sheet' },
    h('span', { class: 'stamp' }, isNew ? 'Новая улика' : 'Улика'),
    h('h2', {}, clue.title),
    h('p', { class: 'type' }, clue.text),
    h('div', { class: 'actions' }, btn('Дальше', () => ctx.closeModal()))));
}

export function render(root, ctx, { id }) {
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

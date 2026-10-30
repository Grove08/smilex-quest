import { h, btn } from '../dom.js';

export function render(root, ctx) {
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

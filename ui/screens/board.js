import { h } from '../dom.js';
import { suspectCard } from '../components/cards.js';

export function render(root, ctx) {
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

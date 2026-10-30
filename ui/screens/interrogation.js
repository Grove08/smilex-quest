import { h, btn, fill } from '../dom.js';
import { portrait, minutes } from '../components/cards.js';

export function render(root, ctx, { id }) {
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

import { h, btn, fill } from '../dom.js';
import { portrait, minutes } from '../components/cards.js';

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

export function render(root, ctx, { id }) {
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

import { h, btn } from '../dom.js';

export function render(root, ctx) {
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

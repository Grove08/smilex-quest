import { h, btn } from '../dom.js';

export function render(root, ctx) {
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

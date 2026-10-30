import { h, btn, fill } from '../dom.js';
import { portrait } from '../components/cards.js';

export function render(root, ctx) {
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

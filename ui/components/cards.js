import { h } from '../dom.js';

export function portrait(s, cls = '') {
  const img = h('img', { src: s.photo, alt: s.name, loading: 'lazy', class: cls });
  img.addEventListener('error', () => img.replaceWith(h('div', { class: 'avatar' }, s.name.slice(0, 1))));
  return img;
}

export function suspectCard(s, { onclick, done } = {}) {
  return h(onclick ? 'button' : 'div', { class: 'polaroid', 'data-focus': onclick ? '' : null, type: onclick ? 'button' : null, onclick },
    portrait(s),
    h('div', { class: 'cap' }, h('b', {}, s.name), h('span', {}, s.role)),
    done ? h('span', { class: 'stamp done' }, 'допрошен') : null);
}

// Закрытая улика ничего не объясняет: ни названия, ни причины.
export function clueCard(c, state, { onclick, index, cost }) {
  const r = ((index * 37) % 7 - 3) * 0.5;
  const title = state === 'locked' ? '🔒 Закрыто' : state === 'open' ? (c.label || 'Предмет') : c.title;
  const body = state === 'locked' ? 'Пока здесь ничего не видно.'
    : state === 'open' ? `Осмотреть · ${cost}` : c.text.length > 90 ? c.text.slice(0, 88) + '…' : c.text;
  return h('button', { class: `clue ${state}`, type: 'button', 'data-focus': '', style: `--r:${r}deg`, onclick }, h('b', {}, title), h('p', {}, body));
}

export const minutes = (sec) => (sec % 60 === 0 ? `${sec / 60} мин` : `${sec} сек`);

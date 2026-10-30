// Навигация стрелками/Enter для пульта ТВ и клавиатуры.
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled && el.getAttribute('disabled') == null; };
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function pickNext(from, items, dir) {
  const c = center(from.getBoundingClientRect());
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const p = center(el.getBoundingClientRect());
    const dx = p.x - c.x, dy = p.y - c.y;
    const along = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy;
    const across = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export function enableFocusNav({ scopeFn, onBack }) {
  window.addEventListener('keydown', (e) => {
    const t = document.activeElement;
    const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT');
    if (e.key === 'Escape' || (e.key === 'Backspace' && !typing) || e.key === 'BrowserBack') { e.preventDefault(); onBack?.(); return; }
    if (!e.key.startsWith('Arrow') || typing) return;
    const scope = scopeFn();
    const items = [...scope.querySelectorAll('[data-focus]')].filter(visible);
    if (!items.length) return;
    e.preventDefault();
    const cur = items.includes(t) ? t : null;
    const next = cur ? pickNext(cur, items, e.key) : items[0];
    if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
  });
}

const svg = (inner, w = 400, h = 400) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${inner}</svg>`)}")`;
const noise = (freq, oct, k, [r, g, b], extra = '') =>
  `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oct}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${k} 0 0 0 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>${extra}`;

export function applyTheme() {
  const t = {
    '--tex-grain': svg(noise('.9', 2, '1.1', [0, 0, 0]), 220, 220),
    '--tex-paper': svg(noise('.04', 3, '.9', [.55, .4, .2]) + noise('.7', 2, '.5', [.35, .25, .1]).replace("id='n'", "id='m'").replace('url(#n)', 'url(#m)'), 500, 500),
    '--tex-cork': svg(noise('.035', 4, '1.4', [.35, .2, .08]) + noise('.5', 2, '.9', [.25, .13, .04]).replace("id='n'", "id='m'").replace('url(#n)', 'url(#m)'), 600, 600),
    '--tex-wood': svg(noise('.012 .35', 4, '1.6', [.03, .02, .01]), 700, 700),
    '--tex-stain': svg("<radialGradient id='g'><stop offset='0' stop-color='%236b3f1d' stop-opacity='.35'/><stop offset='1' stop-color='%236b3f1d' stop-opacity='0'/></radialGradient><circle cx='60' cy='60' r='50' fill='url(%23g)'/><circle cx='60' cy='60' r='38' fill='none' stroke='%236b3f1d' stroke-opacity='.25' stroke-width='3'/>", 120, 120),
  };
  for (const [k, v] of Object.entries(t)) document.documentElement.style.setProperty(k, v);
}

// Собирает все модули в один обычный скрипт dist/app.js, чтобы игра открывалась двойным кликом (file://).
// Запуск: node tools/bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const entry = join(root, 'app.js');
const order = [];
const seen = new Set();
const id = (p) => relative(root, p).split(String.fromCharCode(92)).join('/');

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^import\s[^;]*?from\s+'([^']+)';?$/gm)) visit(resolve(dirname(file), m[1]));
  order.push(file);
}
visit(entry);

function transform(file) {
  let src = readFileSync(file, 'utf8');
  const names = [];
  src = src.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';?$/gm, (_, ns, p) => `const ${ns} = __m['${id(resolve(dirname(file), p))}'];`);
  src = src.replace(/^import\s+\{([^}]*)\}\s+from\s+'([^']+)';?$/gm, (_, list, p) =>
    `const { ${list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': ')).join(', ')} } = __m['${id(resolve(dirname(file), p))}'];`);
  src = src.replace(/^export\s+(async\s+function|function|const|let)\s+(\w+)/gm, (_, kw, name) => { names.push(name); return `${kw} ${name}`; });
  src = src.replace(/^export\s+default\s+/gm, () => { names.push('default'); return 'const __default = '; });
  return { src, names };
}

let out = '(function () {\nconst __m = {};\n';
for (const file of order) {
  const { src, names } = transform(file);
  if (file === entry) {
    const caseJson = readFileSync(join(root, 'cases', 'smilex.json'), 'utf8');
    const body = src.replace(/const caseData = await \(await fetch\('cases\/smilex\.json'\)\)\.json\(\);/, `const caseData = ${JSON.stringify(JSON.parse(caseJson))};`);
    if (body === src) throw new Error('в app.js не найден fetch дела');
    out += `;(async () => {\n${body}\n})();\n`;
  } else {
    out += `__m['${id(file)}'] = (() => {\n${src}\nreturn { ${names.map((n) => (n === 'default' ? 'default: __default' : n)).join(', ')} };\n})();\n`;
  }
}
out += '})();\n';
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'app.js'), out);
console.log('dist/app.js:', order.length, 'модулей,', Math.round(out.length / 1024), 'КБ');

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
if (!existsSync(dist)) throw new Error('Missing dist/: run npm run build first');

function allFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}

const files = allFiles(dist);
const forbidden = files.filter(file =>
  /(?:^|\/)\.env(?:\.|$)/.test(file) ||
  /\.(?:map|vue|ts|tsx|pem|key)$/i.test(file));
if (forbidden.length) {
  throw new Error('Private source or Source Map emitted: ' +
    forbidden.map(f => relative(dist, f)).join(', '));
}
const scripts = files.filter(file => extname(file) === '.js');
if (!scripts.length) throw new Error('No JavaScript emitted');
const js = scripts.map(file => readFileSync(file, 'utf8'));
// The Vite plugin itself rejects builds if no first-party chunk was changed.

for (const code of js) {
  if (/sourceMappingURL\s*=|VITE_XUNHU_SECRET|VITE_MYSQL_PASSWORD|VITE_PROCESSOR_SHARED_TOKEN/.test(code)) {
    throw new Error('Exposed source map or private environment name in production JS');
  }
}
console.log('Frontend artifact check passed: no source maps or backend secrets.');

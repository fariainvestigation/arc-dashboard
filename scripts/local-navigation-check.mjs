import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let checked = 0;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'archive'].includes(ent.name)) continue;
    const target = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(target, out); else out.push(target);
  }
  return out;
}

for (const file of walk(root).filter(f => f.endsWith('.html'))) {
  const source = fs.readFileSync(file, 'utf8');
  // Attribute scan is for actual HTML markup only. Strings inside scripts can
  // legitimately contain route fragments or generated href= markup.
  const markup = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const re = /(?:href|src|poster|action)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(markup))) {
    const ref = m[1].trim();
    if (!ref || /^(?:#|data:|blob:|mailto:|tel:|javascript:|https?:|\/\/)/i.test(ref)) continue;
    if (ref.startsWith('/')) {
      failures.push(`${path.relative(root,file)}: root-absolute local path ${ref}`);
      continue;
    }
    const clean = decodeURIComponent(ref.split(/[?#]/)[0]).replace(/\\/g, '/');
    if (!clean) continue;
    let target = path.resolve(path.dirname(file), clean);
    if (clean.endsWith('/')) target = path.join(target, 'index.html');
    checked += 1;
    if (!fs.existsSync(target)) failures.push(`${path.relative(root,file)}: missing ${ref}`);
  }
}

// Runtime routes that previously caused C:\\investigator and C:\\cases failures.
const runtime = {
  'index.html': [/href="\/investigator\//, /href="\/site\//, /src="\/assets\//],
  'investigator/index.html': [/location\.href\s*=\s*["']\/cases/, /src="\/arc_backend/, /src="\/assets/],
  'cases/index.html': [/href="\/investigator/, /src="\/arc_/, /href="\/arc_/, /location\.href\s*=\s*["']\/arc-notebook/, /location\.href\s*=\s*["']\/cases\/intake/],
  'cases/intake/index.html': [/src="\/arc_/, /href="\/arc_/, /src="\/assets/, /href="\/assets/, /location\.href\s*=\s*["']\/arc-notebook/]
};
for (const [name, patterns] of Object.entries(runtime)) {
  const source = fs.readFileSync(path.join(root,name),'utf8');
  for (const pattern of patterns) if (pattern.test(source)) failures.push(`${name}: runtime root path ${pattern}`);
}

if (failures.length) {
  failures.forEach(f => console.error('FAIL:', f));
  console.error(`Local navigation check failed: ${failures.length} issue(s).`);
  process.exit(1);
}
console.log(`Local navigation check passed: ${checked} static references, 0 broken/root-absolute paths.`);

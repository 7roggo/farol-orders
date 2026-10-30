// Adds ?v=<version> to every local CSS/JS link and import, so browsers load the new files after each update.
// Run before pushing a new version: node tools/stamp.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk('assets/js'); walk('supabase/functions/_shared');
const targets = [...files.filter((f) => f.endsWith('.js') && !f.includes('/vendor/')), 'index.html', 'hub.html', 'admin.html', 'order.html'];
const re = /((?:from\s+|import\s*\(\s*|src=|href=)["'])(\.{1,2}\/[^"'?]+\.(?:js|mjs|css))(\?v=\d+)?(["'])/g;
for (const f of targets) {
  const s = readFileSync(f, 'utf8');
  const out = s.replace(re, (_, a, path, __, b) => `${a}${path}?v=${v}${b}`)
    .replace(/((?:src|href)=["'])((?:assets|config)[^"'?]*\.(?:js|css))(\?v=\d+)?(["'])/g, (_, a, path, __, b) => `${a}${path}?v=${v}${b}`);
  if (out !== s) writeFileSync(f, out);
}
console.log('stamped', v);

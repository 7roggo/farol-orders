// Joins the migrations into supabase/setup.sql, so the whole database is set up with one paste in the SQL Editor.
// Run: node tools/build-setup.mjs   (run tools/build-seed.mjs first if you changed the sample menu)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const parts = files.map((f) => `-- >>> ${f}\n${readFileSync(new URL(f, dir), 'utf8').trim()}\n`);
writeFileSync(new URL('../supabase/setup.sql', import.meta.url),
  `-- Farol Orders — complete database setup. Paste all of this into Supabase → SQL Editor → Run (once).\n-- Generated from supabase/migrations by tools/build-setup.mjs.\n\n${parts.join('\n')}`);
console.log('wrote supabase/setup.sql from', files.join(', '));

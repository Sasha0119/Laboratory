/**
 * Verifies every locale in /locales matches en.json exactly.
 *
 * A missing key does not crash — i18next silently falls back to English — so
 * without this check a half-translated screen looks fine until a user who
 * reads no English opens it. Run after adding or renaming any key.
 *
 *   node scripts/check-locales.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'locales');
const BASE = 'en';

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
  );

const placeholders = (s) =>
  [...String(s ?? '').matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort().join(',');

const locales = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''));

const load = (code) => Object.fromEntries(
  flatten(JSON.parse(readFileSync(join(DIR, `${code}.json`), 'utf8'))).filter(
    ([k]) => k !== '_note'
  )
);

const base = load(BASE);
const baseKeys = Object.keys(base).sort();
let problems = 0;

console.log(`${BASE}: ${baseKeys.length} keys\n`);

for (const code of locales.filter((c) => c !== BASE)) {
  const target = load(code);
  const keys = Object.keys(target).sort();
  const missing = baseKeys.filter((k) => !(k in target));
  const extra = keys.filter((k) => !(k in base));

  // An untranslated string is not an error (it may legitimately be identical),
  // but a lost {{placeholder}} renders as literal braces to the user.
  const broken = baseKeys.filter(
    (k) => placeholders(base[k]) !== placeholders(target[k])
  );

  const ok = !missing.length && !extra.length && !broken.length;
  console.log(`${code}: ${keys.length} keys ${ok ? 'OK' : ''}`);
  for (const k of missing) console.log(`   missing:     ${k}`);
  for (const k of extra) console.log(`   not in ${BASE}:  ${k}`);
  for (const k of broken) {
    console.log(`   placeholders: ${k} — expected {{${placeholders(base[k])}}}`);
  }
  problems += missing.length + extra.length + broken.length;
}

if (problems) {
  console.error(`\n${problems} problem(s).`);
  process.exit(1);
}
console.log('\nAll locales match.');

// Checker: runs our solve.js and the reference csv-reader 1.0.0 (imported from the kit given at run time) on the practice
// cases, and compares each answer with the reference's and with practice/reference/expected.json, as the scorer does.
// Usage: node tools/check.mjs <kit-dir>    (or KIT=<kit-dir> node tools/check.mjs)
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const kit = resolve(process.argv[2] ?? process.env.KIT ?? '');
if (!process.argv[2] && !process.env.KIT) {
  console.error('usage: node tools/check.mjs <kit-dir>');
  process.exit(2);
}
const ref = await import(pathToFileURL(join(kit, 'baselines/csv-reader/vendor/csv-reader/index.js')).href);
const ours = await import(new URL('../solve.js', import.meta.url).href);

// The scorer's equality: a JSON value with every object's keys sorted.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

const cases = JSON.parse(readFileSync(join(kit, 'practice/input/cases.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(kit, 'practice/reference/expected.json'), 'utf8'));
let bad = 0;
cases.forEach((c, i) => {
  const a = canonical(JSON.parse(JSON.stringify(ours.run(c.input))));
  const r = canonical(JSON.parse(JSON.stringify(ref.readCsv(c.input))));
  const e = canonical(expected.cases[i].output);
  const ok = a === r && a === e;
  if (!ok) bad++;
  console.log(`${c.id}: ${ok ? 'identical' : 'DIFFERENT'}${a === r ? '' : ' (vs reference)'}${a === e ? '' : ' (vs expected.json)'}`);
});
console.log(bad === 0 ? `all ${cases.length} cases identical` : `${bad} of ${cases.length} cases differ`);
process.exit(bad === 0 ? 0 : 1);

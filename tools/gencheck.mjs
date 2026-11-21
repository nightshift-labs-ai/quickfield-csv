// Generator check: draws fresh cases with the kit's own case generator (program/generator/subject/csv-cases.mjs, fed
// by program/generator/rng.ts streamFor) from seeds of our choosing, and compares solve.js with the reference on each.
// That covers the scored set's distribution beyond the 6 practice cases.
// Usage: node tools/gencheck.mjs <kit-dir> [count=30] [seed=gencheck-1]
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const kitArg = process.argv[2] ?? process.env.KIT;
if (!kitArg) {
  console.error('usage: node tools/gencheck.mjs <kit-dir> [count] [seed]');
  process.exit(2);
}
const kit = resolve(kitArg);
const COUNT = Number(process.argv[3] ?? 30);
const SEED = process.argv[4] ?? 'gencheck-1';
const url = (p) => pathToFileURL(join(kit, p)).href;
const { generate } = await import(url('program/generator/subject/csv-cases.mjs'));
const { streamFor } = await import(url('program/generator/rng.ts'));
const ref = await import(url('baselines/csv-reader/vendor/csv-reader/index.js'));
const ours = await import(new URL('../solve.js', import.meta.url).href);

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

let bad = 0;
const tally = {};
for (let i = 0; i < COUNT; i++) {
  const input = generate(streamFor(SEED, 'case', i), i);
  const a = ours.run(input);
  const r = ref.readCsv(input);
  const ok = JSON.stringify(a) === JSON.stringify(r) || canonical(a) === canonical(r);
  for (const e of r.errors) tally[e.code] = (tally[e.code] ?? 0) + 1;
  if (!ok) {
    bad++;
    console.log(`case ${i} (seed ${SEED}): DIFFERENT`);
  }
}
console.log(`${COUNT} generated cases, seed ${SEED}: ${bad === 0 ? 'all identical' : `${bad} differ`}; reference errors met: ${JSON.stringify(tally)}`);
process.exit(bad === 0 ? 0 : 1);

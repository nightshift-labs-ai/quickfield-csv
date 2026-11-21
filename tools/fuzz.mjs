// Differential fuzzer: random inputs heavy in the hard parts of the policy, our solve.js against the reference
// csv-reader 1.0.0 (imported from the kit given at run time). Prints the first differing input, minimised.
// Usage: node tools/fuzz.mjs <kit-dir> [count=20000] [seed=1]    (or KIT=<kit-dir>)
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const kitArg = process.argv[2] ?? process.env.KIT;
if (!kitArg) {
  console.error('usage: node tools/fuzz.mjs <kit-dir> [count] [seed]');
  process.exit(2);
}
const kit = resolve(kitArg);
const COUNT = Number(process.argv[3] ?? 20000);
const SEED = Number(process.argv[4] ?? 1);
const ref = await import(pathToFileURL(join(kit, 'baselines/csv-reader/vendor/csv-reader/index.js')).href);
// SOLVE=<path> tests another module (e.g. a deliberately broken copy, to check the fuzzer catches it).
const ours = await import(process.env.SOLVE ? pathToFileURL(resolve(process.env.SOLVE)).href : new URL('../solve.js', import.meta.url).href);

// mulberry32: a small seeded PRNG.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(SEED);
const int = (k) => Math.floor(rand() * k);
const pick = (xs) => xs[int(xs.length)];

// Tokens: the characters the policy treats specially, weighted heavily, and plain text.
const HARD = ['"', '"', '""', '"""', ',', ',', '\n', '\r', '\r\n', '\r\r\n', '\n\n', '﻿', ' ', '\t', ',"', '",', '"\r', '\r"', '"\n'];
const SOFT = ['a', 'b', 'xyz', '12', 'é', 'Москва', '𝄞', '😀', '\uD800', '\uDC00', ' ', '\0', "O'Brien", 'café'];

function tokenSoup(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += rand() < 0.6 ? pick(HARD) : pick(SOFT);
  return s;
}

function field() {
  const r = rand();
  const word = () => pick(SOFT) + (rand() < 0.5 ? pick(SOFT) : '');
  if (r < 0.35) return word();
  if (r < 0.45) return '';
  if (r < 0.75) {
    // a quoted field, maybe with doubled quotes, commas, line breaks inside, junk after
    let inner = '';
    const k = int(5);
    for (let i = 0; i < k; i++) inner += pick([word(), '""', ',', '\n', '\r\n', '\r', ' ']);
    let f = `"${inner}"`;
    if (rand() < 0.15) f += pick(['x', ' ', '"', '\r', 'ab"c', '""']);
    if (rand() < 0.05) f = f.slice(0, -1); // maybe unterminated
    return f;
  }
  if (r < 0.85) return word() + pick(['"', '"x"', '\r', '\r\r', '﻿']) + word();
  return tokenSoup(1 + int(4));
}

function table(rowsN, maxW) {
  const eol = rand() < 0.5 ? '\n' : '\r\n';
  const w = 1 + int(maxW);
  let s = rand() < 0.3 ? '﻿' : '';
  for (let r = 0; r < rowsN; r++) {
    let k = w;
    const t = rand();
    if (t < 0.1) k = Math.max(1, w - 1 - int(w));
    else if (t < 0.2) k = w + 1 + int(3);
    const fs = [];
    for (let i = 0; i < k; i++) fs.push(field());
    if (rand() < 0.05) s += pick(['\n', '\r\n', '\r\n\r\n', '\r', '\r\r\n']);
    s += fs.join(',');
    if (rand() < 0.05) s += ',';
    if (r < rowsN - 1 || rand() < 0.5) s += rand() < 0.9 ? eol : pick(['\n', '\r\n', '\r']);
  }
  if (rand() < 0.1) s = s.slice(0, int(s.length + 1));
  return s;
}

function makeText(i) {
  const r = rand();
  if (r < 0.03) return pick(['', ' ', '  \t', '﻿', '\n', '\r', '\r\n', '"', '""', '﻿﻿', ',', '\r\r', '"\r\n"']);
  if (r < 0.35) return tokenSoup(1 + int(30));
  if (r < 0.95) return table(1 + int(12), 6);
  if (i % 50 === 0) return table(200 + int(800), 18); // a large realistic table now and then
  return table(20 + int(60), 12);
}

const canon = (v) => JSON.stringify(v);
function same(input) {
  let a, b;
  try {
    a = canon(ours.run(input));
  } catch (e) {
    a = `THROW ${e}`;
  }
  try {
    b = canon(ref.readCsv(input));
  } catch (e) {
    b = `THROW ${e}`;
  }
  return a === b;
}

// Minimise by deleting chunks, then single characters, while the difference stays.
function minimise(input) {
  let t = input.text;
  for (let chunk = Math.max(1, t.length >> 1); chunk >= 1; chunk >>= 1) {
    let i = 0;
    while (i < t.length) {
      const u = t.slice(0, i) + t.slice(i + chunk);
      if (!same({ text: u, header: input.header })) t = u;
      else i += chunk;
    }
  }
  return { text: t, header: input.header };
}

let n = 0;
let chars = 0;
for (let i = 0; i < COUNT; i++) {
  const input = { text: makeText(i), header: rand() < 0.5 };
  chars += input.text.length;
  n++;
  if (!same(input)) {
    const m = minimise(input);
    console.log(`DIFFERENCE at input ${i} (seed ${SEED}); minimised:`);
    console.log(JSON.stringify(m));
    console.log('ours:', JSON.stringify(ours.run(m)));
    console.log('ref: ', JSON.stringify(ref.readCsv(m)));
    process.exit(1);
  }
}
console.log(`${n} inputs (${chars} characters), seed ${SEED}: 0 differences`);

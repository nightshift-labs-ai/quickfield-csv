// Timing: spawns each variant as a fresh `node <main.ts>` on the practice set, reads the child's CPU time (user + system,
// all threads) and peak RSS from /usr/bin/time, interleaves the variants run by run, and prints each one's trimmed mean
// (2 fastest and 2 slowest dropped) and the same net of a do-nothing control (`node -e 0`).
// Usage: node tools/time.mjs <kit-dir> [runs=10] [name=path/to/main.ts ...]
//   With no variants given it times ours (./main.ts) against the house baseline (<kit>/baselines/csv-reader/main.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const kitArg = process.argv[2] ?? process.env.KIT;
if (!kitArg) {
  console.error('usage: node tools/time.mjs <kit-dir> [runs] [name=main.ts ...]');
  process.exit(2);
}
const kit = resolve(kitArg);
const RUNS = Number(process.argv[3] ?? 10);
const repo = resolve(new URL('..', import.meta.url).pathname);
let variants = process.argv.slice(4).map((a) => {
  const [name, path] = a.split('=');
  return { name, args: [resolve(path)] };
});
if (variants.length === 0) {
  variants = [
    { name: 'ours', args: [join(repo, 'main.ts')] },
    { name: 'house', args: [join(kit, 'baselines/csv-reader/main.ts')] },
  ];
}
variants.push({ name: 'control', args: ['-e', '0'] });

const input = join(kit, 'practice/input');
const outRoot = join(repo, 'out/time');
const samples = new Map(variants.map((v) => [v.name, []]));
const rss = new Map(variants.map((v) => [v.name, 0]));

for (let r = 0; r < RUNS; r++) {
  // rotate the order each round so no variant always goes first
  for (let k = 0; k < variants.length; k++) {
    const v = variants[(k + r) % variants.length];
    const out = join(outRoot, v.name);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const p = spawnSync('/usr/bin/time', ['-f', 'CPU %U %S %M', process.execPath, ...v.args], {
      env: { ...process.env, MAKEFUN_INPUT_DIR: input, MAKEFUN_OUTPUT_DIR: out },
      encoding: 'utf8',
    });
    const m = /CPU (\S+) (\S+) (\d+)/.exec(p.stderr);
    if (p.status !== 0 || !m) {
      console.error(`${v.name} failed:`, p.stderr);
      process.exit(1);
    }
    samples.get(v.name).push(Number(m[1]) + Number(m[2]));
    rss.set(v.name, Math.max(rss.get(v.name), Number(m[3])));
  }
}

const trimmed = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const t = s.length > 4 ? s.slice(2, -2) : s;
  return t.reduce((a, b) => a + b, 0) / t.length;
};
const control = trimmed(samples.get('control'));
console.log(`runs per variant: ${RUNS} (interleaved); CPU = user + sys seconds; trimmed mean drops 2 fastest + 2 slowest`);
console.log('variant\ttrimmed CPU s\tnet of control s\tpeak RSS MB\tall samples');
for (const v of variants) {
  const t = trimmed(samples.get(v.name));
  console.log(`${v.name}\t${t.toFixed(3)}\t${(t - control).toFixed(3)}\t${(rss.get(v.name) / 1024).toFixed(0)}\t${samples.get(v.name).map((x) => x.toFixed(2)).join(' ')}`);
}
// the answers of every variant but the control must be identical bytes
const names = variants.filter((v) => v.name !== 'control').map((v) => v.name);
const bytes = names.map((n) => readFileSync(join(outRoot, n, 'answers.json')));
const sameBytes = bytes.every((b) => b.equals(bytes[0]));
console.log(`answers.json identical across variants: ${sameBytes}`);

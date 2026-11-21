// Phase profile of one driver run: read, JSON.parse, run() per case, JSON.stringify, writeFile, with process.cpuUsage
// (all threads of this process) per phase. Run it with the same V8 flags the driver uses, e.g.
//   node --no-incremental-marking tools/profile.mjs <kit-dir> [solve.js path]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const kit = resolve(process.argv[2] ?? process.env.KIT ?? '.');
const solve = process.argv[3] ? pathToFileURL(resolve(process.argv[3])).href : new URL('../solve.js', import.meta.url).href;
const { run } = await import(solve);
const out = resolve(new URL('../out/profile', import.meta.url).pathname);
mkdirSync(out, { recursive: true });

let last = process.cpuUsage();
const rows = [];
const mark = (name) => {
  const now = process.cpuUsage();
  rows.push([name, (now.user - last.user + now.system - last.system) / 1000]);
  last = process.cpuUsage();
};
const raw = readFileSync(join(kit, 'practice/input/cases.json'), 'utf8');
mark('readFileSync');
const cases = JSON.parse(raw);
mark('JSON.parse');
const answers = [];
for (const c of cases) answers.push(run(c.input));
mark('run x6');
const s = JSON.stringify(answers);
mark('JSON.stringify');
writeFileSync(join(out, 'answers.json'), s);
mark('writeFileSync');
for (const [n, ms] of rows) console.log(`${n.padEnd(16)} ${ms.toFixed(1)} ms`);
const ru = process.resourceUsage();
console.log(`total process CPU ${((ru.userCPUTime + ru.systemCPUTime) / 1000).toFixed(1)} ms, maxRSS ${(ru.maxRSS / 1024).toFixed(0)} MB`);

// The entry's driver (node22, which strips the types itself): reads every case from /input/cases.json (a JSON array of
// {id, input}), answers each one with run(c.input) from solve.js, and writes /output/answers.json, a JSON array of the
// answers in the cases' order. MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output outside a
// container. It follows the house driver's structure; V8 flags are set before solve.js is imported.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const answers: unknown[] = [];
for (const c of cases) answers.push(run(c.input));
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));

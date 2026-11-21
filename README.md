# csv-reader-speed-01: a faster drop-in for csv-reader 1.0.0

Entry for the make.fun board `csv-reader-speed-01-run-20261121`.

- `solve.js`: a dependency-free ES module. `run({text, header})` returns exactly what csv-reader 1.0.0's `readCsv`
  returns, `{columns, rows, errors}`. One left-to-right pass with `charCodeAt`, with whole fields taken by `slice()`
  (quoted fields are joined from slices between doubled quotes and CRs). The rare paths (stray CR, junk after a closing
  quote, a quote that never closes) go through one plain helper function with no closures. On import it warms up on a
  few tiny texts that take every branch, so V8 optimises `run()` once instead of deoptimising and recompiling it about a
  dozen times.
- `main.ts`: the driver (Node 22.18+, which strips the types). It reads `/input/cases.json` (or
  `$MAKEFUN_INPUT_DIR/cases.json`), calls `run(c.input)` for every case, and writes `/output/answers.json` (or
  `$MAKEFUN_OUTPUT_DIR`) with `JSON.stringify`. It sets V8 flags `--no-incremental-marking --single-threaded-gc` before
  importing `solve.js`.
- `notes/SPEC.md`: every rule of the reference, traced to the reference's code.

## Tools

None of them hold kit paths. Give the kit directory as the first argument (or as `KIT=`).

```sh
node tools/check.mjs <kit-dir>                     # practice cases: ours vs the reference vs expected.json
node tools/fuzz.mjs <kit-dir> [count] [seed]       # differential fuzzer, seeded; prints the first difference, minimised
EXHAUSTIVE=7 node tools/fuzz.mjs <kit-dir> 20000   # also every string up to length 7 over  " , LF CR a BOM  (both headers)
node tools/time.mjs <kit-dir> [runs] [name=main.ts ...]   # fresh `node main.ts` per run, child CPU via /usr/bin/time
node --no-incremental-marking --single-threaded-gc tools/profile.mjs <kit-dir>   # CPU per phase of one run
```

`tools/fuzz.mjs` with `SOLVE=<path>` tests another module. Three deliberately broken copies of `solve.js` (a lone CR
inside quotes not counted as a line, quote_junk skipped for one-character junk, short rows padded with "x") were each
caught within the first 5 inputs and minimised to 3-6 characters.

## Correctness (last run, at the final commit)

- `tools/check.mjs`: all 6 practice cases identical to the reference and to `expected.json`.
- `tools/fuzz.mjs`: seeds 1-7, 20,000 inputs each (seed 5: 100,000), plus the exhaustive sweep of all 671,846 strings up
  to length 7 over the special characters: 0 differences.
- Two runs of `node main.ts` write identical `answers.json` bytes.

## Measured CPU time (practice set, 6 cases, about 10.2 M characters)

Same machine (4 cores, WSL2, Node v22.23.4), same interleaved runs, a fresh process per run. CPU is the child's user +
sys (all threads) from `/usr/bin/time`. The trimmed mean drops the 2 fastest and 2 slowest runs. The control is
`node -e 0`.

Final, 12 runs per variant (`node tools/time.mjs <kit> 12`):

| variant | flags | trimmed CPU s | net of control s | peak RSS MB |
|---|---|---|---|---|
| ours (`main.ts` + `solve.js`) | `--no-incremental-marking --single-threaded-gc` | 0.305 | 0.296 | 255 |
| house (`baselines/csv-reader/main.ts` + csv-reader 1.0.0) | `--no-incremental-marking` | 0.969 | 0.960 | 339 |
| control (`node -e 0`) | none | 0.009 | 0 | 43 |

The machine's level drifts between sessions (the same build measured 0.30-0.35 s), so only variants run in the same
interleaved session are compared below.

What each step measured (each a separate interleaved session against the version before it):

| change | before s | after s | kept |
|---|---|---|---|
| first exact `solve.js` vs house (10 runs) | 1.022 (house) | 0.540 | yes |
| V8 flags: `--single-threaded`, `--max-semi-space-size=32`, both, `--single-threaded-gc` + semi-space 32 (10 runs) | 0.480 | 0.480-0.488 | no (noise) |
| warm-up at import (10 runs) | 0.507 | 0.342 | yes |
| `--max-opt=2` (Maglev only), alone / with warm-up (10 runs) | 0.507 / 0.342 | 0.465 / 0.467 | no |
| warm-up also covers every end-of-text path and junk then line break: 0 deopts (10 runs) | 0.323 | 0.298 | yes |
| warm-up 150 / 400 iterations instead of 48 (12 runs) | 0.331 | 0.361 / 0.360 | no |
| warm-up 24 iterations; input read as Buffer + `toString()` (12 runs) | 0.349 | 0.345 / 0.342 | no (noise) |
| `--no-maglev` (12 runs) | 0.330 | 0.328 | no (noise) |
| `--single-threaded-gc` (12 runs, then 20 runs) | 0.330, 0.348 | 0.323, 0.337 | yes |
| hand-written serializer instead of `JSON.stringify` (in-process, 3 reps) | 64-66 ms | 178-212 ms | no |

Phase profile of one run of ours (`tools/profile.mjs`, CPU of all threads): readFileSync + UTF-8 decode about 31 ms,
JSON.parse about 19 ms, run() for 6 cases 128-178 ms (warm, run() alone is about 45 ms; the rest is the one TurboFan
compile and GC), JSON.stringify about 50 ms, writeFileSync about 13 ms. Loading any `.ts` file costs about 35 ms of
CPU for type stripping, against about 5 ms for `node -e 0`.

## License

MIT (see `LICENSE`).

// A faster drop-in for csv-reader 1.0.0's readCsv: run({text, header}) returns the same {columns, rows, errors}.
// One left-to-right pass with charCodeAt; whole fields are taken with slice() instead of being built a character at a
// time. The common paths (an unquoted field with no CR, a quoted field closed by a comma or a line break) are inlined in
// the main loop; the rare ones (stray CR, characters after a closing quote, a quote that never closes) go through
// readUnquoted, a plain function that hands its extra results back through module variables (no closures, so the main
// loop's variables stay in registers). notes/SPEC.md lists the rules, each traced to the reference's code.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Extra results of readUnquoted: where reading goes on, how the field ended, how many characters it kept.
let gPos = 0;
let gEnded = END;
let gAdded = 0;

// The reference's readUnquoted, from index i, appending to `value`: up to the next comma, LF or CRLF (or the end);
// a CR not followed by LF is dropped with a stray_cr error on the current record.
function readUnquoted(text, n, i, value, errors, recordLine, recordRow) {
  let start = i;
  let added = 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 44) {
      gPos = i + 1;
      gEnded = COMMA;
      gAdded = added + (i - start);
      return value + text.slice(start, i);
    }
    if (c === 10) {
      gPos = i + 1;
      gEnded = LINE_BREAK;
      gAdded = added + (i - start);
      return value + text.slice(start, i);
    }
    if (c === 13) {
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        gPos = i + 2;
        gEnded = LINE_BREAK;
        gAdded = added + (i - start);
        return value + text.slice(start, i);
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (i > start) {
        value += text.slice(start, i);
        added += i - start;
      }
      i += 1;
      start = i;
      continue;
    }
    i += 1;
  }
  gPos = n;
  gEnded = END;
  gAdded = added + (n - start);
  return value + text.slice(start, n);
}

export function run(input) {
  const text = String(input.text);
  let needHeader = input.header === true;
  const header = needHeader;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  for (;;) {
    // Lines with no characters (LF or CRLF alone) are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = needHeader ? null : rows.length;
    const fields = [];
    let ended = COMMA;
    let quoted = false;
    do {
      let value;
      if (pos < n && text.charCodeAt(pos) === 34) {
        // A quoted field: up to the next quote that is not doubled.
        quoted = true;
        const open = pos;
        let j = pos + 1;
        let seg = j;
        let qlines = 0;
        let closed = false;
        value = '';
        while (j < n) {
          const c = text.charCodeAt(j);
          if (c === 34) {
            if (j + 1 < n && text.charCodeAt(j + 1) === 34) {
              value += text.slice(seg, j + 1);
              j += 2;
              seg = j;
              continue;
            }
            value += text.slice(seg, j);
            j += 1;
            closed = true;
            break;
          }
          if (c === 13) {
            // CRLF or a lone CR inside quotes: one LF, one line.
            value += text.slice(seg, j) + '\n';
            qlines += 1;
            j += j + 1 < n && text.charCodeAt(j + 1) === 10 ? 2 : 1;
            seg = j;
            continue;
          }
          if (c === 10) qlines += 1;
          j += 1;
        }
        if (!closed) {
          // Never closes: the quote is a literal character and the text after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          value = readUnquoted(text, n, open + 1, '"', errors, recordLine, recordRow);
          pos = gPos;
          ended = gEnded;
          if (ended === LINE_BREAK) line += 1;
        } else {
          line += qlines;
          if (j >= n) {
            pos = j;
            ended = END;
          } else {
            const c = text.charCodeAt(j);
            if (c === 44) {
              pos = j + 1;
              ended = COMMA;
            } else if (c === 10) {
              pos = j + 1;
              line += 1;
              ended = LINE_BREAK;
            } else if (c === 13 && j + 1 < n && text.charCodeAt(j + 1) === 10) {
              pos = j + 2;
              line += 1;
              ended = LINE_BREAK;
            } else {
              // What follows the closing quote is appended as it stands, up to the next comma or line break.
              value = readUnquoted(text, n, j, value, errors, recordLine, recordRow);
              if (gAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              pos = gPos;
              ended = gEnded;
              if (ended === LINE_BREAK) line += 1;
            }
          }
        }
      } else {
        // An unquoted field: up to the next comma, LF or CRLF; a lone CR goes the slow way.
        quoted = false;
        let i = pos;
        for (;;) {
          if (i >= n) {
            value = text.slice(pos, n);
            pos = n;
            ended = END;
            break;
          }
          const c = text.charCodeAt(i);
          if (c === 44) {
            value = text.slice(pos, i);
            pos = i + 1;
            ended = COMMA;
            break;
          }
          if (c === 10) {
            value = text.slice(pos, i);
            pos = i + 1;
            line += 1;
            ended = LINE_BREAK;
            break;
          }
          if (c === 13) {
            if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
              value = text.slice(pos, i);
              pos = i + 2;
              line += 1;
              ended = LINE_BREAK;
              break;
            }
            value = readUnquoted(text, n, pos, '', errors, recordLine, recordRow);
            pos = gPos;
            ended = gEnded;
            if (ended === LINE_BREAK) line += 1;
            break;
          }
          i += 1;
        }
      }
      fields.push(value);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && !quoted && fields[0] === '') continue;

    if (width < 0) width = fields.length;
    if (needHeader) {
      columns = fields;
      needHeader = false;
      continue;
    }
    const len = fields.length;
    if (len < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: len });
      for (let k = len; k < width; k++) fields.push('');
    } else if (len > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}

// Warm-up at import: a few small texts that take every branch of run() (BOM, CRLF and LF, empty lines, stray CRs, doubled
// quotes, line breaks inside quotes, junk after a closing quote, a quote that never closes, short and long rows, header
// true and false, one-byte and two-byte text), so V8 has type feedback for all of it before it optimises run() on the
// first real case. Without it run() is deoptimised and recompiled about a dozen times (tools/time.mjs: 0.51 s -> 0.34 s
// CPU on the practice set). The answers are discarded; run() keeps nothing from one call to the next.
{
  const parts = [
    'a,b,c\r\n1,"x""y",z\n"q"junk,2\r,3,4\n\n\r\n5\n6,7,8,9,10\r\r\n',
    '"multi\nline\r\nx\ry",",",""\n"q"\r,"r"\rs,t\n\r\n\r\n"j"k\n1,"j"\rk\r\n',
    'é,Москва,"𝄞 ""q"" ",\n,,\n"a"\r\n"b"\n"c",x\r\r\n',
  ];
  // texts end every way a field can meet the end: unquoted, quoted, after junk, after a comma, after a stray CR
  const ends = ['', 'z', '"z"', '"z"j', 'z,', 'z\r', 'u,"open never closes\n,v\rw\n', 'u,"open never closes\n,v\rw'];
  for (let k = 0; k < 48; k++) {
    const t = parts[k % 3] + parts[(k + 1) % 3] + parts[(k + 2) % 3];
    run({ text: (k & 1 ? '﻿' : '') + t + ends[k % 8], header: (k & 2) === 0 });
  }
}

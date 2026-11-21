# csv-reader 1.0.0: the rules as its code applies them

Read from the reference's `index.js` (`readCsv`) line by line. Line numbers below are that file's. The prose
comment at its top agrees with the code, but where wording and code could be read differently, the code wins. Each
rule below says what the code does.

## Input
- `text = String(input.text)`, `header = input.header === true`. Only the boolean `true` means a header (L35-36).
- Empty text: the main loop breaks at once. Answer `{columns: header ? [] : null, rows: [], errors: []}` (L163, L192).

## BOM
- Only a U+FEFF at index 0 is skipped (`pos = 1`) (L44). A U+FEFF anywhere else, including a second one at index 1,
  is an ordinary character in a field. The line count is not touched.

## Record starts and empty lines
- Before each record, every LF and every CRLF is skipped, each one adding 1 to `line` (L152-162). A lone CR
  (CR not followed by LF) stops the skipping and starts a record.
- If the skipping reaches the end of the text, reading ends (L163).
- `recordLine = line` and `recordRow = (header && columns === null) ? null : rows.length` are fixed when the record
  starts (L165-166). Every error of the record uses them.

## Fields
- A field is quoted only if its first character is `"` (L171). A `"` anywhere else in an unquoted field is
  an ordinary character (readUnquoted has no case for it).
- Fields repeat while one ends at a comma (L170-174). A comma right before LF, CRLF or the end gives a final `""` field.
  At the end of the text the next field is read from `pos >= length`: not quoted, empty, ended by END.

### Unquoted field (readUnquoted, L61-89)
- Takes characters up to the first `,` (ends COMMA), `\n` (ends LINE_BREAK, line+1) or `\r\n` (LINE_BREAK, line+1),
  or the end of the text (END).
- A `\r` not followed by `\n` is dropped: no character kept, no line counted, and an error
  `{code:'stray_cr', line: recordLine, row: recordRow}` is pushed right then (L80). A CR at the very end of the text
  is stray too (`at(len)` is `''`).
- `added` counts the characters kept (code units). Dropped CRs don't count.

### Quoted field (readQuoted, L92-148)
- The opening quote is skipped. Characters are then read until a `"` that is not directly followed by another `"`.
  `""` gives one `"` (L100-109).
- Inside the quotes: CRLF gives one `\n` and line+1; a lone CR gives `\n` and line+1; LF stays and line+1 (L110-119).
- Never closed (end of text reached): `pos` goes back to just after the opening quote, `line` back to its value at the
  quote, `unterminated_quote` is pushed first, then the rest is read again as an unquoted field whose value starts
  with a literal `"` (L121-127). That re-read can push `stray_cr` errors (after the unterminated_quote). The field
  still counts as "quoted" for the empty-record test below.
- Closed: whatever follows the closing quote decides how the field ends:
  - end of text gives END; `,` gives COMMA; `\n` or `\r\n` gives LINE_BREAK, line+1 (L128-143);
  - anything else, including a lone CR, goes to readUnquoted with the quoted value as the prefix (L145). Any stray CRs
    there are dropped with their `stray_cr` errors. Then, only if at least one character was kept, one
    `quote_junk` error is pushed (after those stray_crs) (L146). So `"a"\r,` has a stray_cr but no quote_junk, and
    `"a"x"y` keeps `ax"y` with one quote_junk.

## Record end
- A record with exactly one field, which is `""` and not quoted, is no record: it is dropped. Any `stray_cr` errors
  it pushed stay, and its row index is not used up (L177). This covers lines holding only stray CRs and a lone CR at the
  end. A record of `""` (two quotes) is a record with one empty field.
- `width` is the field count of the first record kept, header or not (L179).
- If header is true and no columns are taken yet, the record becomes `columns`, with no padding or cutting and no
  short/long check (L180-183).
- Otherwise, fewer fields than `width`: push `{code:'short_row', line, row, fields: count}` and pad with `""`.
  More fields than `width`: push `{code:'long_row', line, row, extra: [the cut fields]}` and cut to `width`
  (L184-189). Then the record goes on `rows`.

## Error order
- Errors are pushed as they are met, so within a record: stray_cr / unterminated_quote / quote_junk in reading order
  (a field's quote_junk after that field's stray_crs), then short_row or long_row last.
- `line` is the 1-based line the record starts on. It counts every LF, CRLF and lone CR inside quotes, and every LF
  and CRLF outside them. Stray CRs outside quotes are not counted.

## Output
- `{columns: header ? (columns ?? []) : null, rows, errors}`: rows are arrays of strings, all of `width` length.
- Strings are exact code-unit slices of the text (lone surrogates included), apart from the CR to LF rewrite inside
  quotes and the `""` to `"` rewrite.

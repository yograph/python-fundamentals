// Reference implementation of the TSV word-bank rules in
// docs/DATA_CONTRACT.md ("banks/<deckId>.tsv"). The frontend data layer and the
// audio generator each carry their own parser for the same format, so the edge
// cases below are the contract, not implementation detail. Keep them in sync.
//
// The format exists to make quoting impossible to get wrong: a data line is
// exactly `line.split("\t")` and there is no quoted-field mode. The price is
// that no field may contain a tab or a newline, which is enforced rather than
// escaped.
//
// Edge cases, all deliberate:
//
//   - Columns are addressed BY HEADER NAME. Reordering columns changes nothing;
//     unknown columns are ignored so a new column needs no schema bump.
//   - The header is the first line that is neither blank nor a comment.
//   - A line is blank when it has no non-whitespace character. Note that a line
//     consisting only of tabs is therefore *skipped*, not read as a row of
//     empty fields.
//   - A line is a comment when its first non-whitespace character is "#". There
//     is no way to escape a leading "#"; no id or front field starts with one.
//   - Header cells are trimmed of surrounding whitespace; duplicate header
//     names are an error because "address by name" would be ambiguous.
//   - Field values are NOT trimmed: a trailing space in `front` is data, and
//     silently eating it would change the audio key. Individual tags *are*
//     trimmed, since `a, b` is the natural way to write a tag list.
//   - **A row may omit trailing OPTIONAL columns.** With header
//     `id front back tags`, the row `ik<TAB>ik<TAB>I` is valid and means no
//     tags, exactly as `ik<TAB>ik<TAB>I<TAB>` does. Forgetting the final tab on
//     a word with no tags is the likeliest hand-edit slip there is, and it is
//     unambiguous, so it is accepted. Omitted cells read as "".
//   - A row that omits a REQUIRED column is an error. Which columns are required
//     is the caller's policy, passed as `requiredColumns`; this module only
//     knows how to apply it. With no `requiredColumns` the parser is fully
//     lenient, so a generic reader can parse anything a validator would accept.
//   - A row with MORE fields than the header is an error, since that is the
//     visible symptom of a tab inside a field: the data is then not saying what
//     it looks like it says. Trailing *empty* extras are forgiven, because a
//     stray trailing tab adds an empty cell for a column that does not exist and
//     therefore cannot misstate anything — the mirror image of the omitted
//     trailing tab above, and lenient for the same reason.
//   - Line endings: LF and CRLF both parse. A lone CR left inside a field is
//     rejected rather than guessed at.
//
// Line numbers in problem messages are 1-based and count every physical line
// of the input, including skipped blanks and comments, so they match what an
// editor shows.

/** Characters that can never appear inside a field. */
const FORBIDDEN_FIELD_CHARS = /[\t\n\r]/;

function isBlank(line) {
  return line.trim() === "";
}

function isComment(line) {
  return line.trimStart().startsWith("#");
}

/**
 * Splits a `tags` cell into trimmed, non-empty tags in authored order.
 * An empty or whitespace-only cell means no tags.
 * @param {string} cell
 * @returns {string[]}
 */
export function parseTagCell(cell) {
  return String(cell ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/**
 * Parses TSV text into header-keyed rows.
 *
 * Never throws on malformed input: problems are collected so a caller can
 * report all of them at once (CI reads the whole list, not the first line).
 *
 * Each row reports `missing`: the columns the line stopped short of. Those read
 * as "", and are only a problem when one of them is in `requiredColumns`.
 *
 * @param {string} text
 * @param {{requiredColumns?: string[]}} [options]
 * @returns {{
 *   columns: string[],
 *   rows: Array<{ line: number, values: Record<string, string>, missing: string[] }>,
 *   problems: Array<{ line: number | null, message: string }>,
 * }}
 */
export function parseTsv(text, { requiredColumns = [] } = {}) {
  /** @type {Array<{line: number | null, message: string}>} */
  const problems = [];
  const problem = (line, message) => problems.push({ line, message });

  const lines = String(text ?? "").split(/\r\n|\n/);

  let columns = [];
  /** @type {Array<{line: number, values: Record<string, string>}>} */
  const rows = [];
  let headerLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (isBlank(line) || isComment(line)) continue;

    const cells = line.split("\t");

    if (headerLine === -1) {
      headerLine = lineNumber;
      columns = cells.map((cell) => cell.trim());
      // A trailing tab on the header would declare a nameless column.
      while (columns.length > 0 && columns.at(-1) === "") columns.pop();
      if (columns.some((name) => name === "")) {
        problem(lineNumber, "header has an empty column name");
      }
      const duplicates = columns.filter(
        (name, at) => columns.indexOf(name) !== at,
      );
      for (const name of new Set(duplicates)) {
        problem(lineNumber, `header declares column "${name}" more than once`);
      }
      continue;
    }

    // Forgive trailing empty extras (a stray trailing tab), reject the rest:
    // extra non-empty fields mean a tab crept into a value.
    const trimmed = [...cells];
    while (trimmed.length > columns.length && trimmed.at(-1) === "") {
      trimmed.pop();
    }
    if (trimmed.length > columns.length) {
      problem(
        lineNumber,
        `has ${trimmed.length} fields but the header declares ${columns.length}` +
          " — a field probably contains a tab, which is not allowed",
      );
    }

    // Trailing columns the line stopped short of. Omitting them is fine as long
    // as they are all optional; a missing required column is a real error.
    const missing = columns.slice(Math.min(trimmed.length, columns.length));
    const missingRequired = missing.filter((name) =>
      requiredColumns.includes(name),
    );
    if (missingRequired.length > 0) {
      problem(
        lineNumber,
        `has ${trimmed.length} field(s) but the header declares ${columns.length}` +
          `, omitting required column(s) ${missingRequired.map((name) => `"${name}"`).join(", ")}` +
          (missing.length > missingRequired.length
            ? ` (also missing optional: ${missing.filter((name) => !requiredColumns.includes(name)).join(", ")})`
            : ""),
      );
    }

    /** @type {Record<string, string>} */
    const values = {};
    columns.forEach((name, at) => {
      const value = trimmed[at] ?? "";
      if (FORBIDDEN_FIELD_CHARS.test(value)) {
        problem(
          lineNumber,
          `field "${name}" contains a tab, newline or carriage return, which is not allowed`,
        );
      }
      values[name] = value;
    });
    rows.push({ line: lineNumber, values, missing });
  }

  if (headerLine === -1) problem(null, "no header row found");

  return { columns, rows, problems };
}

/**
 * Serializes rows to TSV with the given columns as the header.
 *
 * Values may be strings (used as-is) or arrays (joined with "," — that is how
 * `tags` is written). `null`/`undefined` become an empty cell. Throws on a
 * value containing a tab or newline: there is no escape syntax to fall back on,
 * so refusing to write is the only correct behaviour.
 *
 * Output always ends in a single trailing newline, and never contains \r.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} columns
 * @returns {string}
 */
export function serializeTsv(rows, columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("serializeTsv needs at least one column");
  }
  for (const name of columns) {
    if (FORBIDDEN_FIELD_CHARS.test(name)) {
      throw new Error(
        `column name ${JSON.stringify(name)} contains a tab or newline`,
      );
    }
  }

  const lines = [columns.join("\t")];

  rows.forEach((row, index) => {
    const cells = columns.map((name) => {
      const raw = row?.[name];
      const value = Array.isArray(raw)
        ? raw.map((item) => String(item)).join(",")
        : raw == null
          ? ""
          : String(raw);
      if (FORBIDDEN_FIELD_CHARS.test(value)) {
        // index + 2: rows are 0-based, and line 1 is the header.
        throw new Error(
          `line ${index + 2}: field "${name}" contains a tab or newline` +
            ` (${JSON.stringify(value)}) — no field may, and there is no escape syntax`,
        );
      }
      return value;
    });
    lines.push(cells.join("\t"));
  });

  return `${lines.join("\n")}\n`;
}

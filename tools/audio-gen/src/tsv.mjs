/**
 * The word-bank TSV reader from docs/DATA_CONTRACT.md.
 *
 * Deliberately hand-rolled and about forty lines long: because no field may
 * contain a tab or a newline, a line is `split("\t")` and there is no quoted
 * field mode to get wrong. Kept here rather than imported from
 * tools/data-tools so this package stays a zero-dependency workspace of its own.
 *
 * Rules encoded here:
 *   - columns are addressed by header *name*, so reordering is allowed and
 *     unknown columns are ignored;
 *   - blank lines and lines whose first non-space character is `#` are skipped;
 *   - trailing tabs for empty last columns are fine, and so is omitting them:
 *     `ik⇥ik⇥I` and `ik⇥ik⇥I⇥` both mean "no tags". Forgetting the final tab on
 *     a word with no tags is the likeliest hand-edit slip, and it is
 *     unambiguous, so it is accepted rather than failed;
 *   - a row that omits a *required* column is an error, and so is a row with
 *     more fields than the header — that is a stray tab, which would silently
 *     shift a column;
 *   - a field containing a tab, newline or carriage return is rejected.
 */

const REQUIRED_COLUMNS = ["id", "front", "back"];

/** Only `tags` is optional today; every unknown column is optional too. */
function isRequired(column) {
  return REQUIRED_COLUMNS.includes(column);
}

class BankError extends Error {}

function skippable(line) {
  const trimmed = line.trimStart();
  return trimmed === "" || trimmed.startsWith("#");
}

/**
 * Parse a bank file's text into `{ columns, rows }`, where each row is an
 * object keyed by header name. `label` only ever appears in error messages.
 */
export function parseTsv(text, label = "bank") {
  // Tolerate CRLF input even though the writers all emit LF.
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (!skippable(lines[i])) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    throw new BankError(`${label}: no header row (the file has no content).`);
  }

  // Comments may precede the header, so the header's own line number is worth
  // naming: "line 1" would send you to the wrong line.
  const headerLine = headerIndex + 1;
  const columns = lines[headerIndex].split("\t").map((name) => name.trim());
  const missing = REQUIRED_COLUMNS.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    throw new BankError(
      `${label}:${headerLine}: header is missing required column(s) ` +
        `${missing.join(", ")}. Found: ${columns.join(", ")}.`,
    );
  }
  const duplicates = columns.filter(
    (name, i) => name !== "" && columns.indexOf(name) !== i,
  );
  if (duplicates.length > 0) {
    throw new BankError(
      `${label}:${headerLine}: header has duplicate column(s) ` +
        `${[...new Set(duplicates)].join(", ")}.`,
    );
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (skippable(line)) continue;

    const lineNumber = i + 1;
    const fields = line.split("\t");

    // A short row is fine as long as every column it omits is optional: the
    // omitted cells read as empty, exactly as trailing tabs would.
    if (fields.length < columns.length) {
      const omitted = columns.slice(fields.length);
      const omittedRequired = omitted.filter(isRequired);
      if (omittedRequired.length > 0) {
        throw new BankError(
          `${label}:${lineNumber}: row has ${fields.length} field(s) and omits ` +
            `required column(s) ${omittedRequired.join(", ")}.`,
        );
      }
    }
    // More fields than the header is a stray tab, which would silently shift a
    // column, so it is an error even when the extras are empty.
    if (fields.length > columns.length) {
      throw new BankError(
        `${label}:${lineNumber}: row has ${fields.length} field(s) but the ` +
          `header declares ${columns.length}; that is a stray tab.`,
      );
    }

    const row = {};
    for (let c = 0; c < columns.length; c += 1) {
      const name = columns[c];
      if (name === "") continue; // unnamed column: ignored, like any unknown one
      const value = fields[c] ?? "";
      if (/[\t\n\r]/.test(value)) {
        throw new BankError(
          `${label}:${lineNumber}: field "${name}" contains a tab or newline, ` +
            "which the data contract forbids.",
        );
      }
      row[name] = value;
    }
    rows.push({ ...row, __line: lineNumber });
  }

  return { columns, rows };
}

/** `tags` is comma-separated inside its one cell; empty cell means no tags. */
export function parseTags(cell) {
  if (typeof cell !== "string" || cell.trim() === "") return [];
  return cell
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/**
 * Bank text -> the word records the generator cares about. Unknown columns are
 * dropped here, which is what lets a column be added without a schema bump.
 */
export function parseBank(text, label = "bank") {
  const { rows } = parseTsv(text, label);
  return rows.map((row) => ({
    id: row.id,
    front: row.front,
    back: row.back,
    tags: parseTags(row.tags),
    line: row.__line,
  }));
}

export { BankError };

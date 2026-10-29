import type { z } from "zod";
import type {
  AudioIndex,
  Deck,
  DeckSummary,
  Manifest,
  Word,
} from "@/types/deck";
import type { ExerciseSet, ExerciseSetSummary } from "@/types/exercise";
import {
  audioIndexSchema,
  bankRowSchema,
  DATA_SCHEMA_VERSION,
  exerciseFileSchemas,
  manifestSchema,
} from "./schemas";

/**
 * The one place that talks to the network. Everything fetched here is validated
 * before it leaves this module, so the rest of the app can treat
 * `Manifest`/`Deck`/`AudioIndex` as facts.
 */

/**
 * Where `data/` is served from. Same-origin `/data` by default, which is what
 * `vite dev` serves and what `scripts/postbuild.mjs` copies into `dist/data`.
 */
export const DATA_BASE_URL: string =
  // The `?.` is what keeps this module importable outside a bundler - a node
  // script exercising the parser has no `import.meta.env` to read.
  // The default follows Vite's base: "/data" at the domain root, and
  // "/<repo>/data" when the site is served as a GitHub project page.
  import.meta.env?.VITE_DATA_BASE_URL ??
  `${(import.meta.env?.BASE_URL ?? "/").replace(/\/+$/, "")}/data`;

/** Resolves a path relative to `data/` (as found in the manifest or audio index). */
export function dataUrl(relativePath: string): string {
  const base = DATA_BASE_URL.replace(/\/+$/, "");
  const path = relativePath.replace(/^\/+/, "");
  return `${base}/${path}`;
}

/** A fetch that came back, but not with a 2xx. Carries the status for callers. */
export class DataFetchError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number, statusText: string) {
    super(`Failed to fetch ${url}: ${status} ${statusText}`.trimEnd());
    this.name = "DataFetchError";
    this.url = url;
    this.status = status;
  }
}

/**
 * A fetch that succeeded but returned something that is not valid data.
 *
 * This is the one boundary where bad data has to be caught, and the message is
 * the only thing a reader of a bug report will have: it always names the URL,
 * and for line-oriented files the 1-based line number too, so a screenshot is
 * enough to find the offending row in an editor.
 */
export class DataValidationError extends Error {
  readonly url: string;
  readonly line: number | null;

  constructor(url: string, detail: string, line: number | null = null) {
    super(
      line === null
        ? `Invalid data at ${url}: ${detail}`
        : `Invalid data at ${url} line ${line}: ${detail}`,
    );
    this.name = "DataValidationError";
    this.url = url;
    this.line = line;
  }
}

/** Turns a ZodError into one debuggable line: `decks.0.color: expected a #RRGGBB color`. */
function summarizeIssues(error: z.ZodError): string {
  const shown = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });
  const hidden = error.issues.length - shown.length;
  return hidden > 0
    ? `${shown.join("; ")} (+${hidden} more issue${hidden === 1 ? "" : "s"})`
    : shown.join("; ");
}

async function fetchJson<S extends z.ZodTypeAny>(
  url: string,
  schema: S,
  init?: RequestInit,
): Promise<z.output<S>> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new DataFetchError(url, response.status, response.statusText);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DataValidationError(url, "response body is not valid JSON");
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new DataValidationError(url, summarizeIssues(result.error));
  }
  return result.data;
}

/**
 * The freshness oracle. Always network-first: a cached manifest would tell us
 * cached decks are current when they are not.
 */
export function fetchManifest(): Promise<Manifest> {
  return fetchJson(dataUrl("manifest.json"), manifestSchema, {
    cache: "no-store",
  });
}

/**
 * Where a deck's words live. Derived from the id rather than carried as a field:
 * the contract pins banks to `banks/<id>.tsv`, so a stored path could only ever
 * repeat the id or be wrong.
 */
export function bankUrl(deckId: string): string {
  return dataUrl(`banks/${deckId}.tsv`);
}

export function fetchAudioIndex(): Promise<AudioIndex> {
  return fetchJson(dataUrl("audio/index.json"), audioIndexSchema);
}

/**
 * Where an exercise set's items live. Derived from the id, like a bank's path:
 * the contract pins sets to `exercises/<id>.json`.
 */
export function exerciseFileUrl(setId: string): string {
  return dataUrl(`exercises/${setId}.json`);
}

/** Progress is keyed on exercise ids, so two items sharing one id must not pass. */
function checkExerciseIds(url: string, exercises: { id: string }[]): void {
  const seen = new Map<string, number>();
  exercises.forEach((exercise, index) => {
    const first = seen.get(exercise.id);
    if (first !== undefined) {
      throw new DataValidationError(
        url,
        `duplicate exercise id "${exercise.id}" at exercises[${first}] and exercises[${index}]`,
      );
    }
    seen.set(exercise.id, index);
  });
}

function checkUniqueIds(
  url: string,
  items: { id: string }[],
  what: "lesson" | "lab",
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new DataValidationError(url, `duplicate ${what} id "${item.id}"`);
    }
    seen.add(item.id);
  }
}

/**
 * An exercise set's items come from its JSON file; the set's kind comes from
 * the summary, which is also what picks the item schema. A set at a given
 * revision is immutable, exactly like a deck at a given revision.
 *
 * Assembled per kind rather than generically so the returned union member is
 * proven by the compiler instead of asserted.
 */
export async function fetchExerciseSet(
  summary: ExerciseSetSummary,
): Promise<ExerciseSet> {
  const url = exerciseFileUrl(summary.id);
  const base = {
    id: summary.id,
    name: summary.name,
    ...(summary.level === undefined ? {} : { level: summary.level }),
    color: summary.color,
    revision: summary.revision,
  };

  switch (summary.kind) {
    case "grammar": {
      const file = await fetchJson(url, exerciseFileSchemas.grammar);
      checkExerciseIds(url, file.exercises);
      // Lesson ids are route params and the link between a lesson and its
      // exercises, so they need the same uniqueness as exercise ids.
      checkUniqueIds(url, file.lessons, "lesson");
      // Lab ids are route params too.
      checkUniqueIds(url, file.labs, "lab");
      return {
        schemaVersion: file.schemaVersion,
        ...base,
        kind: "grammar",
        lessons: file.lessons,
        exercises: file.exercises,
        labs: file.labs,
      };
    }
    case "translation": {
      const file = await fetchJson(url, exerciseFileSchemas.translation);
      checkExerciseIds(url, file.exercises);
      return {
        schemaVersion: file.schemaVersion,
        ...base,
        kind: "translation",
        exercises: file.exercises,
      };
    }
    case "writing": {
      const file = await fetchJson(url, exerciseFileSchemas.writing);
      checkExerciseIds(url, file.exercises);
      return {
        schemaVersion: file.schemaVersion,
        ...base,
        kind: "writing",
        exercises: file.exercises,
      };
    }
  }
}

/**
 * A deck's words come from its TSV bank. A bank at a given revision is
 * immutable, so the HTTP cache is welcome to help here.
 */
export async function fetchDeck(summary: DeckSummary): Promise<Deck> {
  const url = bankUrl(summary.id);
  const response = await fetch(url);
  if (!response.ok) {
    throw new DataFetchError(url, response.status, response.statusText);
  }
  return parseBank(await response.text(), summary);
}

/** Columns every bank must declare. Anything else it declares is optional. */
const REQUIRED_COLUMNS = ["id", "front", "back"] as const;

/** Characters that can never appear inside a field. */
const FORBIDDEN_FIELD_CHARS = /[\t\n\r]/;

const isBlank = (line: string) => line.trim() === "";
const isComment = (line: string) => line.trimStart().startsWith("#");

/** `tags` is comma-separated inside its one cell; an empty cell means no tags. */
function parseTagCell(cell: string): string[] {
  return cell
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

/**
 * Parses a bank's text into a `Deck`, combining it with the deck's metadata from
 * the manifest.
 *
 * The format makes quoting impossible to get wrong: no field may contain a tab
 * or a newline, so a data line is exactly `split("\t")` and there is no quoted
 * field mode. The rules below are the contract (`docs/DATA_CONTRACT.md`), shared
 * with `tools/data-tools` and `tools/audio-gen`, each of which carries its own
 * parser so that neither workspace has to depend on the other:
 *
 * - Columns are addressed by header **name**, so reordering columns changes
 *   nothing and unknown columns are ignored - which is what lets a column be
 *   added without a schema bump.
 * - The header is the first line that is neither blank nor a comment. Blank
 *   means no non-whitespace character; a comment's first non-whitespace
 *   character is `#`.
 * - Header cells are trimmed and must be unique. Field values are **not**
 *   trimmed: a trailing space in `front` is data, and eating it would change the
 *   audio key. Individual tags are trimmed, since `a, b` is how a list is
 *   written.
 * - A row may omit trailing **optional** columns: `ik⇥ik⇥I` means no tags, just
 *   as `ik⇥ik⇥I⇥` does. Omitting a required column is an error, and so is a row
 *   with more fields than the header - that is a stray tab, which silently
 *   shifts every column after it.
 *
 * Line numbers in errors count every physical line, including the blanks and
 * comments that were skipped, so they match what an editor shows.
 */
export function parseBank(text: string, summary: DeckSummary): Deck {
  const url = bankUrl(summary.id);
  const lines = text.split(/\r\n|\n/);

  let columns: string[] | null = null;
  const words: Word[] = [];
  /** word id -> the line it was first seen on, for the duplicate check. */
  const seenIds = new Map<string, number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (isBlank(line) || isComment(line)) continue;

    const cells = line.split("\t");

    if (columns === null) {
      columns = readHeader(cells, url, lineNumber);
      continue;
    }

    const values = readRow(cells, columns, url, lineNumber);
    const row = bankRowSchema.safeParse({
      id: values.id,
      front: values.front,
      back: values.back,
      tags: parseTagCell(values.tags ?? ""),
    });
    if (!row.success) {
      throw new DataValidationError(
        url,
        summarizeIssues(row.error),
        lineNumber,
      );
    }

    const firstSeen = seenIds.get(row.data.id);
    if (firstSeen !== undefined) {
      throw new DataValidationError(
        url,
        `duplicate word id "${row.data.id}", first seen on line ${firstSeen}. ` +
          "Ids are what a learner's progress is stored under, so two rows " +
          "sharing one id would share one score",
        lineNumber,
      );
    }
    seenIds.set(row.data.id, lineNumber);

    words.push(row.data);
  }

  if (columns === null) {
    throw new DataValidationError(
      url,
      "no header row: every line is blank or a comment",
    );
  }

  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    id: summary.id,
    name: summary.name,
    color: summary.color,
    revision: summary.revision,
    languages: summary.languages,
    words,
  };
}

/**
 * Validates the header and returns the column names in file order. A wrong body
 * altogether (a host answering 200 with an error page, say) lands here, which is
 * why the message reports what it did find.
 */
function readHeader(
  cells: string[],
  url: string,
  lineNumber: number,
): string[] {
  const columns = cells.map((cell) => cell.trim());
  // A trailing tab on the header would otherwise declare a nameless column.
  while (columns.length > 0 && columns.at(-1) === "") columns.pop();

  if (columns.length === 0) {
    throw new DataValidationError(url, "header row is empty", lineNumber);
  }
  if (columns.includes("")) {
    throw new DataValidationError(
      url,
      "header has an empty column name",
      lineNumber,
    );
  }

  const duplicate = columns.find((name, at) => columns.indexOf(name) !== at);
  if (duplicate !== undefined) {
    throw new DataValidationError(
      url,
      `header declares column "${duplicate}" more than once, which makes ` +
        "addressing columns by name ambiguous",
      lineNumber,
    );
  }

  const missing = REQUIRED_COLUMNS.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    throw new DataValidationError(
      url,
      `header is missing required column(s) ${missing.join(", ")}; ` +
        `it declares ${columns.join(", ")}`,
      lineNumber,
    );
  }

  return columns;
}

/**
 * One data row, as a map from column name to raw (untrimmed) value.
 *
 * The two length mismatches are not symmetric, which is the whole point:
 *
 * - **Too few fields** is fine as long as every column that fell off the end is
 *   optional; the missing cells read as empty. Forgetting the final tab on a
 *   word with no tags is the likeliest hand-edit slip there is, and it cannot
 *   mean anything other than "no tags". Hard-failing a whole deck over it would
 *   defeat the reason this format is a TSV: appending a line has to be safe for a
 *   human or an AI to do.
 * - **Too many fields** is an error, because that is a stray tab, and a stray tab
 *   shifts every column after it. The data would then not be saying what it
 *   looks like it says, which is exactly the failure that must never pass.
 */
function readRow(
  cells: string[],
  columns: string[],
  url: string,
  lineNumber: number,
): Record<string, string> {
  const fields = [...cells];
  // Trailing tabs for empty last columns are fine.
  while (fields.length > columns.length && fields.at(-1) === "") fields.pop();

  if (fields.length > columns.length) {
    throw new DataValidationError(
      url,
      `has ${fields.length} fields but the header declares ${columns.length}, ` +
        "so a field contains a tab - which no field may, and there is no " +
        "escape syntax",
      lineNumber,
    );
  }

  const omitted = columns.slice(fields.length);
  const omittedRequired = omitted.filter((name) =>
    REQUIRED_COLUMNS.includes(name as (typeof REQUIRED_COLUMNS)[number]),
  );
  if (omittedRequired.length > 0) {
    throw new DataValidationError(
      url,
      `has ${fields.length} field(s) but the header declares ` +
        `${columns.length}, omitting required column(s) ` +
        omittedRequired.join(", "),
      lineNumber,
    );
  }

  const values: Record<string, string> = {};
  for (let at = 0; at < columns.length; at += 1) {
    const name = columns[at];
    // Omitted trailing optional column: read as empty, per the contract.
    const value = at < fields.length ? fields[at] : "";
    if (FORBIDDEN_FIELD_CHARS.test(value)) {
      throw new DataValidationError(
        url,
        `field "${name}" contains a tab, newline or carriage return`,
        lineNumber,
      );
    }
    values[name] = value;
  }
  return values;
}

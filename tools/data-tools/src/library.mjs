// Loading side of the authored files: data/library.json and data/banks/*.tsv.
// Shared by build-manifest.mjs and validate.mjs so both see exactly the same
// bytes and the same derived values.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJson } from "./json.mjs";
import { BANKS_DIR, DATA_DIR, EXERCISES_DIR, LIBRARY_PATH } from "./paths.mjs";
import { parseTagCell, parseTsv } from "./tsv.mjs";

export const SCHEMA_VERSION = 2;

/** The exercise-set kinds the contract knows. */
export const EXERCISE_KINDS = ["grammar", "translation", "writing"];

/** Columns a bank must declare. Anything else is ignored. */
export const REQUIRED_COLUMNS = ["id", "front", "back"];
/** Columns this tool writes, in this order. */
export const BANK_COLUMNS = ["id", "front", "back", "tags"];

/** First 12 hex characters of the sha256 of some bytes. Used for revisions. */
export function revisionHash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}

/** Reads and parses data/library.json. Throws with the path in the message. */
export function loadLibrary() {
  return readJson(LIBRARY_PATH);
}

/**
 * Where a deck's words live, relative to data/. This is DERIVED from the id and
 * is the only place the convention is written down.
 *
 * There is no authored `bank` field. A path pinned to exactly this value carried
 * no information — it was `id` spelled twice, a field that could only ever be
 * right or wrong and never informative. Deriving it also makes the orphan sweep
 * over banks/ total: a deck cannot point somewhere the sweep does not look.
 */
export function bankRelativePath(id) {
  return `banks/${id}.tsv`;
}

/** Absolute path of a deck's bank file. */
export function bankAbsolutePath(id) {
  return path.join(DATA_DIR, bankRelativePath(id));
}

/**
 * True when a path from a generated file is safely relative to data/. Used for
 * audio clip paths, which are the only paths still written into a data file.
 */
export function isSafeRelativePath(value) {
  return (
    typeof value === "string" &&
    value !== "" &&
    !path.isAbsolute(value) &&
    !value.startsWith("/") &&
    !value.split(/[\\/]/).includes("..")
  );
}

/**
 * Where an exercise set's items live, relative to data/. Derived from the id,
 * for the same reason a deck's bank path is: an authored path field pinned to
 * exactly this value could only ever repeat the id or be wrong.
 */
export function exerciseRelativePath(id) {
  return `exercises/${id}.json`;
}

/** Absolute path of an exercise set's file. */
export function exerciseAbsolutePath(id) {
  return path.join(DATA_DIR, exerciseRelativePath(id));
}

/** `exercises/<stem>.json` file names present on disk, sorted. */
export function listExerciseFiles() {
  if (!fs.existsSync(EXERCISES_DIR)) return [];
  return fs
    .readdirSync(EXERCISES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

/**
 * Reads one exercise set's file, located from its id. As with banks, `revision`
 * hashes the exact bytes, so any edit changes the cache key.
 *
 * @param {string} id exercise set id, e.g. "grammar-a1"
 */
export function loadExerciseSet(id) {
  const relative = exerciseRelativePath(id);
  const file = exerciseAbsolutePath(id);
  const bytes = fs.readFileSync(file);
  let json;
  try {
    json = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`cannot parse data/${relative}: ${error.message}`);
  }
  return { id, relative, file, bytes, json, revision: revisionHash(bytes) };
}

/** `banks/<stem>.tsv` file names present on disk, sorted. */
export function listBankFiles() {
  if (!fs.existsSync(BANKS_DIR)) return [];
  return fs
    .readdirSync(BANKS_DIR)
    .filter((name) => name.endsWith(".tsv"))
    .sort();
}

/**
 * Reads one deck's bank file, located from its id.
 *
 * `revision` hashes the file's exact bytes, so any edit — including whitespace
 * the parser ignores — changes it. That is intentional: the revision is a cache
 * key, and a cheap false invalidation beats a missed one.
 *
 * @param {string} id deck id, e.g. "dutch-1"
 */
export function loadBank(id) {
  const bank = bankRelativePath(id);
  const file = bankAbsolutePath(id);
  const bytes = fs.readFileSync(file);
  const text = bytes.toString("utf8");
  const { columns, rows, problems } = parseTsv(text, {
    requiredColumns: REQUIRED_COLUMNS,
  });

  const words = rows.map(({ line, values, missing }) => ({
    line,
    missing,
    id: values.id ?? "",
    front: values.front ?? "",
    back: values.back ?? "",
    tags: parseTagCell(values.tags ?? ""),
  }));

  return {
    id,
    bank,
    file,
    bytes,
    text,
    columns,
    words,
    problems,
    revision: revisionHash(bytes),
  };
}

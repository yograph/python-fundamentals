#!/usr/bin/env node

// One-shot, idempotent migration of data/ from schema 1 to schema 2.
//
//   node src/migrate-v1-to-v2.mjs [--dry-run]
//
// Schema 1:  data/decks/<deckId>.json   { schemaVersion, id, name, color,
//                                         revision, languages, words: [...] }
//            data/manifest.json         (ISO-timestamp revisions)
//            data/audio/index.json      (schemaVersion 1, generatedAt)
//
// Schema 2:  data/library.json          authored deck metadata
//            data/banks/<deckId>.tsv    authored words, one per line
//            data/manifest.json         generated, content-hash revisions
//            data/audio/index.json      schemaVersion 2, no timestamps
//
// What it carries over untouched:
//   - word ORDER, exactly as in the JSON;
//   - word `id`, BYTE FOR BYTE, including collision suffixes (`morgen-2`).
//     Ids are the keys learner progress is stored under, so they are copied,
//     never recomputed. An id is only generated when the source has none.
//   - `front`, `back` and each word's tag order.
//
// What it drops: the hand-written `revision` timestamps (now derived from a
// content hash) and `wordCount`/`tags` in the manifest (now derived).
//
// It is kept in the repo after the fact so the transformation stays auditable.
// It no-ops when there is nothing left to migrate, and it never deletes the
// legacy files: removing data/decks/ is a reviewable `git rm`.

import fs from "node:fs";
import path from "node:path";
import { buildManifest } from "./build-manifest.mjs";
import { readJson, writeJsonIfChanged } from "./json.mjs";
import { BANK_COLUMNS, bankAbsolutePath, SCHEMA_VERSION } from "./library.mjs";
import {
  AUDIO_INDEX_PATH,
  LEGACY_DECKS_DIR,
  LIBRARY_PATH,
  MANIFEST_PATH,
  rel,
} from "./paths.mjs";
import { assignWordIds } from "./slug.mjs";
import { serializeTsv } from "./tsv.mjs";

/** Legacy label -> BCP-47, for decks predating locale-bearing `languages`. */
const LOCALE_BY_LABEL = { Dutch: "nl-NL", English: "en-US" };

function normalizeLanguage(value, side, deckId) {
  if (value && typeof value === "object") {
    if (!value.label || !value.locale) {
      throw new Error(
        `${deckId}: languages.${side} is missing label or locale`,
      );
    }
    return { label: value.label, locale: value.locale };
  }
  const label = String(value ?? "");
  const locale = LOCALE_BY_LABEL[label];
  if (!locale) {
    throw new Error(
      `${deckId}: no known locale for language label "${label}" (${side}); add it to LOCALE_BY_LABEL`,
    );
  }
  return { label, locale };
}

/** Legacy deck JSON -> { libraryEntry, bankRows }. */
export function convertDeck(legacy) {
  const id = legacy?.id;
  if (typeof id !== "string" || id === "") {
    throw new Error("legacy deck has no id");
  }
  if (!Array.isArray(legacy.words)) {
    throw new Error(`${id}: deck has no words array`);
  }

  // assignWordIds only fills in ids that are absent; existing ones win.
  const generated = assignWordIds(legacy.words);
  const bankRows = legacy.words.map((word, index) => ({
    id:
      typeof word.id === "string" && word.id !== ""
        ? word.id
        : generated[index].id,
    front: String(word.front ?? ""),
    back: String(word.back ?? ""),
    tags: Array.isArray(word.tags) ? word.tags.map((tag) => String(tag)) : [],
  }));

  return {
    libraryEntry: {
      id,
      name: legacy.name,
      color: legacy.color,
      languages: {
        front: normalizeLanguage(legacy.languages?.front, "front", id),
        back: normalizeLanguage(legacy.languages?.back, "back", id),
      },
    },
    bankRows,
  };
}

function listLegacyDecks() {
  if (!fs.existsSync(LEGACY_DECKS_DIR)) return [];
  return fs
    .readdirSync(LEGACY_DECKS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(LEGACY_DECKS_DIR, name));
}

function writeIfChanged(filePath, contents, dryRun) {
  const current = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : null;
  if (current === contents) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  return true;
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const legacyFiles = listLegacyDecks();

  if (legacyFiles.length === 0) {
    console.log(
      `no schema-1 decks under ${rel(LEGACY_DECKS_DIR)} — already migrated, nothing to do`,
    );
    return;
  }

  const libraryEntries = [];
  for (const file of legacyFiles) {
    const { libraryEntry, bankRows } = convertDeck(readJson(file));
    libraryEntries.push(libraryEntry);

    const bankFile = bankAbsolutePath(libraryEntry.id);
    const tsv = serializeTsv(bankRows, BANK_COLUMNS);
    const changed = writeIfChanged(bankFile, tsv, dryRun);
    console.log(
      `${changed ? "wrote" : "unchanged"}: ${rel(bankFile)} (${bankRows.length} words from ${rel(file)})`,
    );
  }

  const library = { schemaVersion: SCHEMA_VERSION, decks: libraryEntries };
  const libraryChanged = dryRun
    ? true
    : writeJsonIfChanged(LIBRARY_PATH, library);
  console.log(
    `${libraryChanged ? "wrote" : "unchanged"}: ${rel(LIBRARY_PATH)} (${libraryEntries.length} deck(s))`,
  );

  // Schema-2 audio index: no generatedAt, and empty is valid.
  const legacyIndex = fs.existsSync(AUDIO_INDEX_PATH)
    ? readJson(AUDIO_INDEX_PATH)
    : {};
  const audioIndex = {
    schemaVersion: SCHEMA_VERSION,
    voices: legacyIndex.voices ?? {},
    clips: Object.fromEntries(
      Object.entries(legacyIndex.clips ?? {}).map(([key, clip]) => [
        key,
        { path: clip.path, bytes: clip.bytes },
      ]),
    ),
  };
  const audioChanged = dryRun
    ? true
    : writeJsonIfChanged(AUDIO_INDEX_PATH, audioIndex);
  console.log(
    `${audioChanged ? "wrote" : "unchanged"}: ${rel(AUDIO_INDEX_PATH)} ` +
      `(${Object.keys(audioIndex.clips).length} clip(s))`,
  );

  if (dryRun) {
    console.log("\n--dry-run: nothing written, manifest not rebuilt");
    return;
  }

  const { manifest } = buildManifest();
  const manifestChanged = writeJsonIfChanged(MANIFEST_PATH, manifest);
  console.log(
    `${manifestChanged ? "wrote" : "unchanged"}: ${rel(MANIFEST_PATH)} (revision ${manifest.revision})`,
  );

  console.log(
    `\nNow remove the legacy files by hand so the deletion is reviewable:\n` +
      `  git rm -r ${rel(LEGACY_DECKS_DIR)}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main(process.argv.slice(2));

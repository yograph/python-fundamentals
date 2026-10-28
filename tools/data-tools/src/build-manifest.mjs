#!/usr/bin/env node

// Regenerates data/manifest.json from data/library.json + data/banks/*.tsv.
//
//   node src/build-manifest.mjs        (or: pnpm data:manifest)
//
// The manifest is a PURE FUNCTION of the authored files: no clock, no
// environment, no ordering surprises. Running it twice produces byte-identical
// output, which is what lets validate.mjs (and CI) assert that the committed
// manifest is exactly what the current inputs produce.

import { serializeJson, writeJsonIfChanged } from "./json.mjs";
import {
  bankRelativePath,
  exerciseRelativePath,
  loadBank,
  loadExerciseSet,
  loadLibrary,
  SCHEMA_VERSION,
} from "./library.mjs";
import { MANIFEST_PATH, rel } from "./paths.mjs";

/**
 * Builds the manifest object from the authored files.
 *
 * Deck entries keep library.json's authored order, which is also the order the
 * app lists decks in.
 *
 * Every field here has to earn its place: the manifest exists so the overview
 * grid can render without fetching a single bank, so a field belongs only if the
 * grid needs it before a deck is loaded. `wordCount` qualifies (the grid shows a
 * count and a progress percentage per deck); a denormalized `tags` list did not,
 * an aggregate top-level revision had no consumer at all, and a `bank` path was
 * just the id spelled twice.
 *
 * @returns {{manifest: object, banks: Array<ReturnType<typeof loadBank>>}}
 */
export function buildManifest() {
  const library = loadLibrary();
  if (!Array.isArray(library?.decks)) {
    throw new Error("data/library.json: decks must be an array");
  }

  const banks = [];
  const decks = library.decks.map((deck) => {
    let bank;
    try {
      bank = loadBank(deck?.id);
    } catch (error) {
      throw new Error(
        `cannot read data/${bankRelativePath(deck?.id)}: ${error.message}`,
      );
    }
    banks.push(bank);

    return {
      id: deck.id,
      name: deck.name,
      color: deck.color,
      // `icon` is optional. Spread it in so an absent icon produces NO key at
      // all: invariant 6 compares bytes, and `"icon": null` is not the same file
      // as no icon. Its validity is the frontend's business — an unknown name
      // falls back to the default icon rather than failing the build.
      ...(deck.icon === undefined ? {} : { icon: deck.icon }),
      languages: deck.languages,
      wordCount: bank.words.length,
      revision: bank.revision,
    };
  });

  // Exercise sets mirror decks: metadata copied from library.json, count and
  // revision derived from the set's file. The key is spread in only when the
  // library lists any sets, so a library without them produces the exact bytes
  // it produced before the field existed (invariant 6 compares bytes).
  const librarySets = Array.isArray(library.exerciseSets)
    ? library.exerciseSets
    : [];
  const exerciseSets = librarySets.map((set) => {
    let loaded;
    try {
      loaded = loadExerciseSet(set?.id);
    } catch (error) {
      throw new Error(
        `cannot read data/${exerciseRelativePath(set?.id)}: ${error.message}`,
      );
    }
    return {
      id: set.id,
      name: set.name,
      kind: set.kind,
      // Optional fields spread in so an absent value produces NO key at all,
      // same as a deck's icon: `"level": null` is not the same file as none.
      ...(set.level === undefined ? {} : { level: set.level }),
      ...(set.course === undefined ? {} : { course: set.course }),
      color: set.color,
      ...(set.icon === undefined ? {} : { icon: set.icon }),
      exerciseCount: Array.isArray(loaded.json?.exercises)
        ? loaded.json.exercises.length
        : 0,
      // Only a grammar set that carries lessons is a course; spread in so a
      // set without them keeps its exact bytes (invariant 6).
      ...(Array.isArray(loaded.json?.lessons) && loaded.json.lessons.length > 0
        ? { lessonCount: loaded.json.lessons.length }
        : {}),
      revision: loaded.revision,
    };
  });

  return {
    manifest: {
      schemaVersion: SCHEMA_VERSION,
      decks,
      ...(exerciseSets.length === 0 ? {} : { exerciseSets }),
    },
    banks,
  };
}

/** The exact bytes the manifest file should contain. */
export function serializeManifest(manifest) {
  return serializeJson(manifest);
}

function main() {
  const { manifest } = buildManifest();
  if (manifest.decks.length === 0 && !manifest.exerciseSets) {
    console.error(
      "data/library.json lists no decks and no exercise sets — nothing to build",
    );
    process.exit(1);
  }

  const changed = writeJsonIfChanged(MANIFEST_PATH, manifest);
  console.log(`${changed ? "wrote" : "unchanged"}: ${rel(MANIFEST_PATH)}`);
  for (const entry of manifest.decks) {
    console.log(
      `  ${entry.id}: ${entry.wordCount} words, revision ${entry.revision}` +
        ` (${bankRelativePath(entry.id)})`,
    );
  }
  for (const entry of manifest.exerciseSets ?? []) {
    const lessons =
      entry.lessonCount === undefined ? "" : `${entry.lessonCount} lessons, `;
    console.log(
      `  ${entry.id}: ${lessons}${entry.exerciseCount} exercises, revision ${entry.revision}` +
        ` (${exerciseRelativePath(entry.id)})`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

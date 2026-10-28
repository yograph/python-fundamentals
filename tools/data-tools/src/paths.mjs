import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this module's own location, never from process.cwd(), so every
// script behaves the same no matter which directory it is invoked from.
// src/ -> data-tools/ -> tools/ -> <repo root>
const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "..", "..", "..");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const BANKS_DIR = path.join(DATA_DIR, "banks");
export const EXERCISES_DIR = path.join(DATA_DIR, "exercises");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
export const LIBRARY_PATH = path.join(DATA_DIR, "library.json");
export const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
export const AUDIO_INDEX_PATH = path.join(AUDIO_DIR, "index.json");

// Legacy schema-1 location, kept only so the migration can find its input.
export const LEGACY_DECKS_DIR = path.join(DATA_DIR, "decks");

/** Path relative to the repo root, for readable log lines. */
export function rel(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath);
}

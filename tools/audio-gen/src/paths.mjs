import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this module's own location, never from process.cwd(), so the
// generator behaves the same whether it is run from the repo root, from this
// workspace, or from a GitHub Actions step.
// src/ -> audio-gen/ -> tools/ -> <repo root>
const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "..", "..", "..");

// FLASHCARDS_DATA_DIR points the generator at a scratch copy of data/ instead
// of the real one. Only useful for testing; unset everywhere in production.
export const DATA_DIR = process.env.FLASHCARDS_DATA_DIR
  ? path.resolve(process.env.FLASHCARDS_DATA_DIR)
  : path.join(REPO_ROOT, "data");

export const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
export const AUDIO_INDEX_PATH = path.join(AUDIO_DIR, "index.json");
export const VOICES_PATH = path.resolve(here, "..", "voices.json");

/** Absolute path for a clip path stored in the index (relative to `data/`). */
export function dataPath(relativeToData) {
  return path.join(DATA_DIR, relativeToData);
}

/** Path relative to the repo root, for readable log lines. */
export function rel(absolutePath) {
  const relative = path.relative(REPO_ROOT, absolutePath);
  // A FLASHCARDS_DATA_DIR outside the repo reads better as an absolute path
  // than as a pile of "../".
  return relative.startsWith("..") ? absolutePath : relative;
}

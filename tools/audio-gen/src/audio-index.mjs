import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AUDIO_INDEX_PATH, rel } from "./paths.mjs";

export const SCHEMA_VERSION = 2;

const EMPTY_INDEX = { schemaVersion: SCHEMA_VERSION, voices: {}, clips: {} };

/**
 * Read data/audio/index.json. A missing, empty, or unparseable file is treated
 * as "nothing generated yet" rather than an error: deleting data/audio/ and
 * rerunning is a supported way to repopulate from scratch.
 */
export async function readAudioIndex() {
  let raw;
  try {
    raw = await fs.readFile(AUDIO_INDEX_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return emptyIndex();
    throw error;
  }

  if (raw.trim() === "") return emptyIndex();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      `warn  ${rel(AUDIO_INDEX_PATH)} is not valid JSON; treating it as empty.`,
    );
    return emptyIndex();
  }

  if (parsed?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `${rel(AUDIO_INDEX_PATH)} has schemaVersion ${parsed?.schemaVersion}, ` +
        `expected ${SCHEMA_VERSION}. Refusing to guess at its shape.\n` +
        "Schema 2 dropped every timestamp; the simplest migration is to delete " +
        "data/audio/ and rerun, which repopulates from scratch.",
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    voices: isObject(parsed.voices) ? { ...parsed.voices } : {},
    clips: normalizeClips(parsed.clips),
  };
}

/**
 * Keep only the fields schema 2 defines. Anything else a hand-edit or an older
 * writer left behind (a `generatedAt`, say) is dropped here rather than being
 * copied forward, which is what keeps rewrites byte-stable.
 */
function normalizeClips(clips) {
  if (!isObject(clips)) return {};
  const out = {};
  for (const [key, entry] of Object.entries(clips)) {
    if (!isObject(entry)) continue;
    out[key] = clipEntry(entry);
  }
  return out;
}

/** One clip entry, with a fixed key order so serialization is stable. */
export function clipEntry({ path: clipPath, bytes }) {
  return { path: clipPath, bytes };
}

/**
 * Stable serialization: sorted keys, 2-space indent, trailing newline, and no
 * timestamp anywhere, so regenerating unchanged content produces a byte-
 * identical file (docs/DATA_CONTRACT.md).
 */
export function serializeAudioIndex({ voices, clips }) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    voices: sortKeys(voices),
    clips: sortKeys(clips, clipEntry),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Write via a sibling temp file plus rename, so a crash mid-write can never
 * leave a half-written index next to real audio files.
 */
export async function writeAudioIndexAtomically(contents) {
  const dir = path.dirname(AUDIO_INDEX_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.index.json.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await fs.writeFile(tempPath, contents, "utf8");
    await fs.rename(tempPath, AUDIO_INDEX_PATH);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

function emptyIndex() {
  return { ...EMPTY_INDEX, voices: {}, clips: {} };
}

function sortKeys(record, mapValue = (value) => value) {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => [key, mapValue(value)]),
  );
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { stripFormatting } from "./format.mjs";
import { dataPath, MANIFEST_PATH, rel } from "./paths.mjs";
import { parseBank } from "./tsv.mjs";

export const MANIFEST_SCHEMA_VERSION = 2;

/**
 * Clip key, exactly as the frontend builds it. `text` must already be stripped
 * of inline formatting; see `spokenText`.
 */
export function clipKey(locale, text) {
  return `${locale}:${text}`;
}

/**
 * The text that is spoken, and the text the key is built from: formatting
 * removed, so `**man**` and `man` are one clip rather than two.
 */
export function spokenText(text) {
  return stripFormatting(text);
}

/** Filename stem: sha1 of the clip key, truncated to 10 hex chars. */
export function clipStem(key) {
  return createHash("sha1").update(key).digest("hex").slice(0, 10);
}

/** Clip path relative to `data/`, matching the data contract. */
export function clipPath(locale, key) {
  return `audio/${locale}/${clipStem(key)}.ogg`;
}

export async function loadManifest() {
  let raw;
  try {
    raw = await fs.readFile(MANIFEST_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `No manifest at ${rel(MANIFEST_PATH)}.\n` +
          "Build it first (pnpm data:manifest), or point FLASHCARDS_DATA_DIR " +
          "at a data directory that has one.",
      );
    }
    throw error;
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${rel(MANIFEST_PATH)} is not valid JSON: ${error.message}`,
    );
  }

  if (manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `${rel(MANIFEST_PATH)} has schemaVersion ${manifest?.schemaVersion}, ` +
        `expected ${MANIFEST_SCHEMA_VERSION}.\n` +
        "This generator reads schema 2: deck metadata in library.json, words in " +
        "banks/<deckId>.tsv. Regenerate the manifest with pnpm data:manifest.",
    );
  }
  if (!Array.isArray(manifest.decks)) {
    throw new Error(`${rel(MANIFEST_PATH)} has no decks array.`);
  }
  return manifest;
}

/** Deck ids are lowercase slugs, per the data contract. */
const DECK_ID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Where a deck's words live, relative to data/. DERIVED from the deck id —
 * `banks/<id>.tsv` — because the schema-2 manifest stopped carrying a `bank`
 * path field (it was the id spelled twice; see docs/DATA_CONTRACT.md). The
 * slug check is what keeps the joined path from ever escaping data/.
 */
function bankPathFor(entry) {
  const id = entry?.id;
  if (typeof id !== "string" || id === "") {
    throw new Error("Manifest deck entry has no id.");
  }
  if (!DECK_ID_SLUG.test(id)) {
    throw new Error(
      `Deck id ${JSON.stringify(id)} is not a lowercase slug, so a bank path ` +
        "cannot safely be derived from it.",
    );
  }
  return `banks/${id}.tsv`;
}

/**
 * Load every deck listed in the manifest (or just one, with `deckId`), reading
 * each deck's words from its TSV bank.
 *
 * The manifest is the index of record, so a bank file it does not reference is
 * deliberately ignored here: the validator is what flags orphans.
 */
export async function loadDecks(deckId = null) {
  const manifest = await loadManifest();
  const entries = deckId
    ? manifest.decks.filter((deck) => deck.id === deckId)
    : manifest.decks;

  if (deckId && entries.length === 0) {
    const known = manifest.decks.map((deck) => deck.id).join(", ") || "none";
    throw new Error(`No deck with id "${deckId}". Known decks: ${known}.`);
  }

  const decks = [];
  for (const entry of entries) {
    const bank = bankPathFor(entry);
    const absolute = dataPath(bank);

    let text;
    try {
      text = await fs.readFile(absolute, "utf8");
    } catch (error) {
      throw new Error(
        error.code === "ENOENT"
          ? `Deck "${entry.id}" points at a missing bank: ${rel(absolute)}.`
          : `Cannot read bank for deck "${entry.id}" at ${rel(absolute)}: ${error.message}`,
      );
    }

    decks.push({
      id: entry.id,
      name: entry.name,
      languages: entry.languages,
      bank,
      words: parseBank(text, rel(absolute)),
    });
  }
  return decks;
}

/**
 * Every clip the decks need, deduplicated across decks by
 * `${locale}:${strippedText}`.
 *
 * That dedup is the entire reason the audio index is shared rather than
 * per-deck: "the" in a Dutch deck and in a German deck are one clip. Stripping
 * formatting before keying extends the same idea to markup: `**de man**` and
 * `de man` are also one clip.
 */
export function collectRequiredClips(decks) {
  const required = new Map();
  const warnings = [];

  for (const deck of decks) {
    for (const side of ["front", "back"]) {
      const language = deck?.languages?.[side];
      if (!language?.locale || !language?.label) {
        throw new Error(
          `Deck "${deck?.id}" is missing languages.${side}.locale/label. ` +
            "The data contract requires both; see docs/DATA_CONTRACT.md.",
        );
      }
    }

    for (const word of deck.words ?? []) {
      for (const side of ["front", "back"]) {
        const { locale, label } = deck.languages[side];
        const raw = word?.[side];

        if (typeof raw !== "string") {
          warnings.push(
            `deck ${deck.id}: word "${word?.id ?? "?"}" has no ${side} text; skipped`,
          );
          continue;
        }

        // Formatting is stripped before speaking *and* before keying, so the
        // key is stable across purely cosmetic edits.
        const text = spokenText(raw);
        if (text.trim() === "") {
          warnings.push(
            `deck ${deck.id}: word "${word?.id ?? "?"}" has no ${side} text ` +
              "left after stripping formatting; skipped",
          );
          continue;
        }

        const key = clipKey(locale, text);
        const existing = required.get(key);
        if (existing) {
          existing.decks.add(deck.id);
          continue;
        }
        required.set(key, {
          key,
          locale,
          label,
          text,
          path: clipPath(locale, key),
          decks: new Set([deck.id]),
        });
      }
    }
  }

  // Sorted so logs, the index diff, and --limit are all deterministic.
  const clips = [...required.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  return { clips, warnings };
}

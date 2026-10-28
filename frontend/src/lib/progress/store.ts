import { z } from "zod";
import type { Deck } from "@/types/deck";
import type { DeckProgress, WordProgress } from "@/types/progress";
import { safeGet, safeRemove, safeSet } from "./storage";

/**
 * Learner progress, stored in localStorage. Pure and synchronous - no React,
 * no network.
 *
 * The hard rule here: **reads never throw.** `localStorage` access itself
 * throws in private-mode Safari and when the quota is blown, and the stored
 * JSON can be anything a user or an older build left behind. Every failure path
 * degrades to empty progress, because losing progress is bad but a blank screen
 * is worse.
 */

const STORAGE_PREFIX = "python-fundamentals:progress:v1:";
/** Written by the previous Firestore-backed version: `{ [frontText]: 0 | 1 }`. */
const LEGACY_PREFIX = "progress_";
/** Marks the one-shot legacy import as attempted, so it never runs twice. */
const MIGRATION_PREFIX = "python-fundamentals:progress:migrated:v1:";

const storageKey = (deckId: string) => `${STORAGE_PREFIX}${deckId}`;
const legacyKey = (deckId: string) => `${LEGACY_PREFIX}${deckId}`;
const migrationKey = (deckId: string) => `${MIGRATION_PREFIX}${deckId}`;

const wordProgressSchema = z.object({
  known: z.boolean(),
  seenCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

const deckProgressSchema = z.object({
  deckId: z.string().min(1),
  updatedAt: z.string(),
  words: z.record(z.string(), wordProgressSchema),
});

/** `{ [front]: 0 | 1 }` - the old shape, tolerant of stray values. */
const legacyProgressSchema = z.record(z.string(), z.number());

function emptyProgress(deckId: string): DeckProgress {
  return { deckId, updatedAt: new Date(0).toISOString(), words: {} };
}

/**
 * The word-id rule from `docs/DATA_CONTRACT.md`, duplicated from
 * `tools/data-tools/src/slug.mjs`: lowercase, every run outside [a-z0-9]
 * collapsed to a single "-", trimmed, empty falls back to "word".
 *
 * It exists here for exactly one reason: legacy progress was keyed by the raw
 * `front` string, and slugifying it is what lands that progress on the right
 * word id. Collision suffixes (`-2`, `-3`, …) are not reproducible from the
 * text alone, so a colliding legacy entry lands on the base id and the
 * duplicate simply starts fresh.
 */
function slugifyWordId(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "word" : slug;
}

function parseStored(deckId: string, raw: string): DeckProgress | null {
  try {
    const result = deckProgressSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    // Trust the key over the payload: the payload's deckId could have been
    // copied between keys by hand.
    return { ...result.data, deckId };
  } catch {
    return null;
  }
}

/**
 * Imports `progress_<deckId>` into the new shape. The legacy key is left in
 * place on purpose - it is the learner's only backup of pre-refactor progress,
 * and it costs a few hundred bytes.
 */
function migrateLegacyProgress(deckId: string): DeckProgress | null {
  const raw = safeGet(legacyKey(deckId));
  if (raw === null) return null;

  let parsed: Record<string, number>;
  try {
    const result = legacyProgressSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    parsed = result.data;
  } catch {
    return null;
  }

  const now = new Date().toISOString();
  const words: Record<string, WordProgress> = {};
  for (const [front, value] of Object.entries(parsed)) {
    const wordId = slugifyWordId(front);
    // The old store held no counts, only a verdict. One sighting is the
    // honest minimum for a word that has a verdict at all.
    words[wordId] = { known: value === 1, seenCount: 1, updatedAt: now };
  }

  return { deckId, updatedAt: now, words };
}

/**
 * Progress for a deck, or empty progress. Never throws.
 *
 * On the first read for a deck (no v1 entry, no migration marker) a legacy
 * entry is imported and written through, so this stays a single read from then
 * on.
 */
export function readDeckProgress(deckId: string): DeckProgress {
  const raw = safeGet(storageKey(deckId));
  if (raw !== null) {
    return parseStored(deckId, raw) ?? emptyProgress(deckId);
  }

  if (safeGet(migrationKey(deckId)) !== null) {
    return emptyProgress(deckId);
  }

  const migrated = migrateLegacyProgress(deckId);
  safeSet(migrationKey(deckId), new Date().toISOString());
  if (migrated === null) {
    return emptyProgress(deckId);
  }
  writeDeckProgress(migrated);
  return migrated;
}

export function writeDeckProgress(progress: DeckProgress): void {
  safeSet(storageKey(progress.deckId), JSON.stringify(progress));
}

export function clearDeckProgress(deckId: string): void {
  safeRemove(storageKey(deckId));
  // The migration marker stays: a reset means "start over", not "re-import the
  // progress I just cleared".
}

/** How many of this deck's words are marked known. Words not in the deck don't count. */
export function countKnown(deck: Deck, progress: DeckProgress): number {
  let known = 0;
  for (const word of deck.words) {
    if (progress.words[word.id]?.known) known += 1;
  }
  return known;
}

/**
 * Pure rating step: bumps `seenCount`, records the verdict, stamps the clock.
 * Returns new objects so query-cache consumers see a changed reference.
 */
export function rateWordProgress(
  progress: DeckProgress,
  wordId: string,
  known: boolean,
): DeckProgress {
  const now = new Date().toISOString();
  const previous = progress.words[wordId];
  return {
    ...progress,
    updatedAt: now,
    words: {
      ...progress.words,
      [wordId]: {
        known,
        seenCount: (previous?.seenCount ?? 0) + 1,
        updatedAt: now,
      },
    },
  };
}

/** Exported for tests and for the reset mutation. */
export function createEmptyDeckProgress(deckId: string): DeckProgress {
  return emptyProgress(deckId);
}

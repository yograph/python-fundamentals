/**
 * Shapes of the static files under `data/`. See `docs/DATA_CONTRACT.md` - this
 * file and the zod schemas in `lib/data/schemas.ts` are two encodings of that
 * contract, and these interfaces are the source of truth for the app's types.
 *
 * Note that `Deck` is not the shape of any one file: words live in a per-deck
 * TSV bank and metadata lives in the manifest, so a `Deck` is what the data
 * layer assembles from a manifest entry plus that entry's parsed bank. The app
 * wants one object per loaded deck, and this is it.
 */

import type { ExerciseSetSummary } from "./exercise";

export interface LanguageInfo {
  label: string;
  locale: string;
}

export interface DeckLanguages {
  front: LanguageInfo;
  back: LanguageInfo;
}

/**
 * One row of a bank. `front` and `back` may carry the inline-formatting subset
 * (`lib/markup`); `id` and `tags` are always plain text.
 */
export interface Word {
  id: string;
  front: string;
  back: string;
  tags: string[];
}

/** A fully loaded deck: a manifest entry plus the words from its bank. */
export interface Deck {
  schemaVersion: number;
  id: string;
  name: string;
  color: string;
  /** Content hash of the bank file (12 hex chars). Doubles as the cache key. */
  revision: string;
  languages: DeckLanguages;
  words: Word[];
}

export interface DeckSummary {
  id: string;
  name: string;
  color: string;
  languages: DeckLanguages;
  /**
   * Derived from the bank. The one derived field the manifest keeps, because the
   * overview shows a count and a progress percentage per deck and must do so
   * without fetching any bank.
   */
  wordCount: number;
  /** Content hash of the bank file (12 hex chars). */
  revision: string;
  /**
   * Optional icon name for the deck tile. Unknown names fall back to a default
   * rather than failing, so a typo costs a deck its icon and nothing more.
   */
  icon?: string;
}

/**
 * There is no aggregate `revision` here. Freshness is decided per deck, so an
 * all-decks hash was a field nothing ever read.
 *
 * `exerciseSets` is optional: a manifest generated before exercise sets
 * existed (or from a library that lists none) simply has no key, and this
 * client treats that as an empty list.
 */
export interface Manifest {
  schemaVersion: number;
  decks: DeckSummary[];
  exerciseSets?: ExerciseSetSummary[];
}

export interface AudioClip {
  path: string;
  bytes: number;
}

/**
 * `clips` is keyed by `` `${locale}:${strippedText}` `` - the card text with
 * inline formatting removed (`lib/markup`), never the raw text. The index
 * carries no timestamps by design: it is a pure function of its inputs.
 */
export interface AudioIndex {
  schemaVersion: number;
  voices: Record<string, string>;
  clips: Record<string, AudioClip>;
}

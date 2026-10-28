import type { DeckProgress } from "@/types/progress";

/**
 * How many entries in stored progress are marked known, without needing the
 * deck itself. The overview renders from the manifest alone, so it has no word
 * list to check ids against - and the deck page wants the same number on screen
 * before its bank has finished loading.
 *
 * Ids for words that have since been removed from a deck can linger in storage,
 * so callers clamp this to the deck's `wordCount`. Once the deck is loaded,
 * `countKnown` from `lib/progress/store` is the exact answer.
 */
export function countKnownEntries(progress: DeckProgress | undefined): number {
  if (!progress) return 0;

  let known = 0;
  for (const word of Object.values(progress.words)) {
    if (word.known) known += 1;
  }
  return known;
}

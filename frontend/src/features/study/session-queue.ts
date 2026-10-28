import type { Deck, LanguageInfo, Word } from "@/types/deck";
import type { StudyDirection } from "@/types/session";

import { directionEndpoints, orientLocales, orientWord } from "./directions";

/**
 * One word, oriented by the session's direction: what is asked, and what
 * answers it.
 *
 * A word is exactly one card. There used to be a "both" direction that put the
 * same word in the queue twice, which meant "cards left" and "words left" were
 * different numbers; with a binary direction `wordId` identifies the card, and
 * the two counts are the same count.
 */
export interface StudyCard {
  wordId: string;
  prompt: string;
  answer: string;
  promptLanguage: LanguageInfo;
  answerLanguage: LanguageInfo;
}

/**
 * The words a selection covers. `null` means "no tag filter", which also keeps
 * words that carry no tags at all.
 */
export function selectWords(deck: Deck, tags: string[] | null): Word[] {
  if (!tags) return deck.words;
  return deck.words.filter((word) =>
    word.tags.some((tag) => tags.includes(tag)),
  );
}

/**
 * The selection as cards. Which side is the prompt comes from `directions.ts`,
 * so the session, the word list and the audio all agree about what is being
 * asked - and the language pair is resolved once for the whole queue rather
 * than per word.
 */
export function buildStudyCards(
  deck: Deck,
  tags: string[] | null,
  direction: StudyDirection,
): StudyCard[] {
  const labels = directionEndpoints(deck.languages, direction);
  const locales = orientLocales(deck.languages, direction);

  const promptLanguage: LanguageInfo = {
    label: labels.from,
    locale: locales.prompt,
  };
  const answerLanguage: LanguageInfo = {
    label: labels.to,
    locale: locales.answer,
  };

  return selectWords(deck, tags).map((word) => ({
    wordId: word.id,
    ...orientWord(word, direction),
    promptLanguage,
    answerLanguage,
  }));
}

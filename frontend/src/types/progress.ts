/**
 * Learner progress. Local-only: it lives in localStorage, keyed by deck, and is
 * never sent anywhere. `words` is keyed by `Word.id`.
 */

export interface WordProgress {
  known: boolean;
  seenCount: number;
  updatedAt: string;
}

export interface DeckProgress {
  deckId: string;
  updatedAt: string;
  words: Record<string, WordProgress>;
}

/**
 * Practice progress, the exercise-set counterpart of deck progress. Also
 * local-only, keyed by set, `exercises` keyed by exercise id. `correct` is the
 * latest verdict — graded for grammar, self-rated for translation and writing.
 */
export interface ExerciseProgress {
  correct: boolean;
  seenCount: number;
  updatedAt: string;
}

export interface PracticeProgress {
  setId: string;
  updatedAt: string;
  exercises: Record<string, ExerciseProgress>;
}

import type { GrammarExercise, GrammarSet } from "@/types/exercise";
import type { PracticeProgress } from "@/types/progress";

/**
 * Lessons have no progress of their own: a lesson's standing is how many of
 * its exercises the learner last answered correctly, read from the set's
 * practice progress. One store, one fact — practising a lesson and practising
 * the whole level move the same numbers.
 */

export interface LessonStanding {
  total: number;
  correct: number;
}

/** The exercises that drill one lesson: those carrying its id as a tag. */
export function lessonExercises(
  set: GrammarSet,
  lessonId: string,
): GrammarExercise[] {
  return set.exercises.filter((exercise) => exercise.tags.includes(lessonId));
}

/** Standing per lesson id, in one pass over the exercises. */
export function lessonStandings(
  set: GrammarSet,
  progress: PracticeProgress | undefined,
): Map<string, LessonStanding> {
  const standings = new Map<string, LessonStanding>(
    set.lessons.map((lesson) => [lesson.id, { total: 0, correct: 0 }]),
  );
  for (const exercise of set.exercises) {
    const isCorrect = progress?.exercises[exercise.id]?.correct === true;
    for (const tag of exercise.tags) {
      const standing = standings.get(tag);
      if (!standing) continue;
      standing.total += 1;
      if (isCorrect) standing.correct += 1;
    }
  }
  return standings;
}

/** A lesson counts as done once every one of its exercises is correct. */
export const isLessonDone = (standing: LessonStanding | undefined) =>
  standing !== undefined &&
  standing.total > 0 &&
  standing.correct >= standing.total;

export const percentOf = ({ correct, total }: LessonStanding) =>
  total > 0 ? Math.round((Math.min(correct, total) / total) * 100) : 0;

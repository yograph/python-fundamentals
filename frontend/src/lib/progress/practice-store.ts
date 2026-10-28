import { z } from "zod";
import type { ExerciseSet } from "@/types/exercise";
import type { ExerciseProgress, PracticeProgress } from "@/types/progress";
import { safeGet, safeRemove, safeSet } from "./storage";

/**
 * Practice progress, the exercise-set counterpart of `store.ts`. Same hard
 * rule: **reads never throw** — every failure path degrades to empty progress.
 * No legacy import here: exercise sets never existed before this store.
 */

const STORAGE_PREFIX = "python-fundamentals:practice:v1:";

const storageKey = (setId: string) => `${STORAGE_PREFIX}${setId}`;

const exerciseProgressSchema = z.object({
  correct: z.boolean(),
  seenCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

const practiceProgressSchema = z.object({
  setId: z.string().min(1),
  updatedAt: z.string(),
  exercises: z.record(z.string(), exerciseProgressSchema),
});

function emptyProgress(setId: string): PracticeProgress {
  return { setId, updatedAt: new Date(0).toISOString(), exercises: {} };
}

/** Progress for a set, or empty progress. Never throws. */
export function readPracticeProgress(setId: string): PracticeProgress {
  const raw = safeGet(storageKey(setId));
  if (raw === null) return emptyProgress(setId);
  try {
    const result = practiceProgressSchema.safeParse(JSON.parse(raw));
    if (!result.success) return emptyProgress(setId);
    // Trust the key over the payload, as the word store does.
    return { ...result.data, setId };
  } catch {
    return emptyProgress(setId);
  }
}

export function writePracticeProgress(progress: PracticeProgress): void {
  safeSet(storageKey(progress.setId), JSON.stringify(progress));
}

export function clearPracticeProgress(setId: string): void {
  safeRemove(storageKey(setId));
}

/** Exported for the reset mutation. */
export function createEmptyPracticeProgress(setId: string): PracticeProgress {
  return emptyProgress(setId);
}

/**
 * Pure rating step: bumps `seenCount`, records the verdict, stamps the clock.
 * Returns new objects so query-cache consumers see a changed reference.
 */
export function rateExerciseProgress(
  progress: PracticeProgress,
  exerciseId: string,
  correct: boolean,
): PracticeProgress {
  const now = new Date().toISOString();
  const previous: ExerciseProgress | undefined = progress.exercises[exerciseId];
  return {
    ...progress,
    updatedAt: now,
    exercises: {
      ...progress.exercises,
      [exerciseId]: {
        correct,
        seenCount: (previous?.seenCount ?? 0) + 1,
        updatedAt: now,
      },
    },
  };
}

/**
 * Pure partial reset: drops the given exercises' entries and keeps the rest.
 * What resetting one lesson means, since a lesson's exercises live in its
 * level's progress.
 */
export function withoutExercises(
  progress: PracticeProgress,
  exerciseIds: readonly string[],
): PracticeProgress {
  const exercises = { ...progress.exercises };
  for (const id of exerciseIds) delete exercises[id];
  return { ...progress, updatedAt: new Date().toISOString(), exercises };
}

/**
 * How many stored entries are marked correct, without needing the set itself —
 * the overview tile's number, clamped by callers to `exerciseCount` since ids
 * of since-removed exercises can linger in storage.
 */
export function countCorrectEntries(
  progress: PracticeProgress | undefined,
): number {
  if (!progress) return 0;

  let correct = 0;
  for (const entry of Object.values(progress.exercises)) {
    if (entry.correct) correct += 1;
  }
  return correct;
}

/** The exact count once the set is loaded: entries not in the set don't count. */
export function countCorrect(
  set: ExerciseSet,
  progress: PracticeProgress,
): number {
  let correct = 0;
  for (const exercise of set.exercises) {
    if (progress.exercises[exercise.id]?.correct) correct += 1;
  }
  return correct;
}

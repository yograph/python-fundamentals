import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { PracticeProgress } from "@/types/progress";
import {
  clearPracticeProgress,
  createEmptyPracticeProgress,
  rateExerciseProgress,
  readPracticeProgress,
  withoutExercises,
  writePracticeProgress,
} from "./practice-store";

/**
 * The exercise-set mirror of `queries.ts`: localStorage is the store, TanStack
 * Query is only the read/notify layer. Same two deliberate consequences —
 * `networkMode: "always"` because nothing here touches the network, and these
 * queries are never persisted by the query persister (localStorage already
 * owns this state; see `lib/query/provider.tsx`).
 */

export const practiceKeys = {
  set: (setId: string) => ["practice-progress", setId] as const,
};

/**
 * Reads progress once, synchronously, via `initialData` — an exercise never
 * renders a loading state for its own progress.
 */
export function usePracticeProgress(
  setId: string,
): UseQueryResult<PracticeProgress> {
  return useQuery({
    queryKey: practiceKeys.set(setId),
    queryFn: () => readPracticeProgress(setId),
    initialData: () => readPracticeProgress(setId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: "always",
  });
}

/**
 * Records a verdict for one exercise. Fully synchronous, so rating never shows
 * a spinner, and reading the current value from the cache keeps rapid
 * successive ratings composing correctly.
 */
export function useRateExercise(
  setId: string,
): UseMutationResult<
  PracticeProgress,
  Error,
  { exerciseId: string; correct: boolean }
> {
  const queryClient = useQueryClient();
  const key = practiceKeys.set(setId);

  return useMutation<
    PracticeProgress,
    Error,
    { exerciseId: string; correct: boolean }
  >({
    networkMode: "always",
    mutationFn: async ({ exerciseId, correct }) => {
      const current =
        queryClient.getQueryData<PracticeProgress>(key) ??
        readPracticeProgress(setId);
      const next = rateExerciseProgress(current, exerciseId, correct);
      writePracticeProgress(next);
      queryClient.setQueryData(key, next);
      return next;
    },
  });
}

/**
 * Resets a set's progress — or, given `onlyExerciseIds`, just those
 * exercises', which is how a lesson's round resets the lesson and not the
 * whole level it belongs to.
 */
export function useResetPracticeProgress(
  setId: string,
  onlyExerciseIds?: readonly string[],
): UseMutationResult<PracticeProgress, Error, void> {
  const queryClient = useQueryClient();
  const key = practiceKeys.set(setId);

  return useMutation<PracticeProgress, Error, void>({
    networkMode: "always",
    mutationFn: async () => {
      if (onlyExerciseIds) {
        const current =
          queryClient.getQueryData<PracticeProgress>(key) ??
          readPracticeProgress(setId);
        const next = withoutExercises(current, onlyExerciseIds);
        writePracticeProgress(next);
        queryClient.setQueryData(key, next);
        return next;
      }
      clearPracticeProgress(setId);
      const empty = createEmptyPracticeProgress(setId);
      queryClient.setQueryData(key, empty);
      return empty;
    },
  });
}

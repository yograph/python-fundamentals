import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { LabProgress } from "@/types/progress";
import { readLabProgress, withStepPassed, writeLabProgress } from "./lab-store";

/**
 * The lab mirror of `practice-queries.ts`: localStorage is the store, TanStack
 * Query only reads and notifies, and these queries are never persisted.
 */

export const labKeys = {
  set: (setId: string) => ["lab-progress", setId] as const,
};

export function useLabProgress(setId: string): UseQueryResult<LabProgress> {
  return useQuery({
    queryKey: labKeys.set(setId),
    queryFn: () => readLabProgress(setId),
    initialData: () => readLabProgress(setId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: "always",
  });
}

/** Records that a step's tests all passed. Synchronous, like rating. */
export function useMarkStepPassed(
  setId: string,
): UseMutationResult<LabProgress, Error, { labId: string; stepId: string }> {
  const queryClient = useQueryClient();
  const key = labKeys.set(setId);

  return useMutation<LabProgress, Error, { labId: string; stepId: string }>({
    networkMode: "always",
    mutationFn: async ({ labId, stepId }) => {
      const current =
        queryClient.getQueryData<LabProgress>(key) ?? readLabProgress(setId);
      const next = withStepPassed(current, labId, stepId);
      writeLabProgress(next);
      queryClient.setQueryData(key, next);
      return next;
    },
  });
}

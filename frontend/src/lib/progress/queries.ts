import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DeckProgress } from "@/types/progress";
import {
  clearDeckProgress,
  createEmptyDeckProgress,
  rateWordProgress,
  readDeckProgress,
  writeDeckProgress,
} from "./store";

/**
 * localStorage is the store; TanStack Query is only the read/notify layer, so a
 * rating re-renders exactly the way remote data does.
 *
 * Two consequences of that split, both deliberate:
 * - `networkMode: "always"` everywhere. These operations never touch the
 *   network, and the default ("online") would *pause* them when the browser
 *   reports itself offline - which is precisely when this app is most useful.
 * - Progress queries are never persisted by the query persister (see
 *   `lib/query/provider.tsx`). localStorage already owns this state.
 */

export const progressKeys = {
  deck: (deckId: string) => ["progress", deckId] as const,
};

/**
 * Reads progress once, synchronously, via `initialData` - so a card never
 * renders a loading state for its own progress - and then serves whatever the
 * mutations below write into the cache.
 */
export function useDeckProgress(deckId: string): UseQueryResult<DeckProgress> {
  return useQuery({
    queryKey: progressKeys.deck(deckId),
    queryFn: () => readDeckProgress(deckId),
    initialData: () => readDeckProgress(deckId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: "always",
  });
}

/**
 * Records a verdict for one word: `seenCount + 1`, `known`, fresh `updatedAt`.
 *
 * The write-through and the cache update both happen inside the mutation body,
 * which is fully synchronous - there is no request to await, so subscribers of
 * `useDeckProgress` see the new value in the same tick and rating a card never
 * shows a spinner. Reading the current value from the cache (falling back to
 * storage) keeps rapid successive ratings composing correctly.
 */
export function useRateWord(
  deckId: string,
): UseMutationResult<DeckProgress, Error, { wordId: string; known: boolean }> {
  const queryClient = useQueryClient();
  const key = progressKeys.deck(deckId);

  return useMutation<DeckProgress, Error, { wordId: string; known: boolean }>({
    networkMode: "always",
    mutationFn: async ({ wordId, known }) => {
      const current =
        queryClient.getQueryData<DeckProgress>(key) ?? readDeckProgress(deckId);
      const next = rateWordProgress(current, wordId, known);
      writeDeckProgress(next);
      queryClient.setQueryData(key, next);
      return next;
    },
  });
}

export function useResetDeckProgress(
  deckId: string,
): UseMutationResult<DeckProgress, Error, void> {
  const queryClient = useQueryClient();
  const key = progressKeys.deck(deckId);

  return useMutation<DeckProgress, Error, void>({
    networkMode: "always",
    mutationFn: async () => {
      clearDeckProgress(deckId);
      const empty = createEmptyDeckProgress(deckId);
      queryClient.setQueryData(key, empty);
      return empty;
    },
  });
}

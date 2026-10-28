import {
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AudioIndex, Deck, DeckSummary, Manifest } from "@/types/deck";
import type { ExerciseSet, ExerciseSetSummary } from "@/types/exercise";
import { DATA_SCHEMA_VERSION } from "./schemas";
import {
  DataFetchError,
  fetchAudioIndex,
  fetchDeck,
  fetchExerciseSet,
  fetchManifest,
} from "./source";

/**
 * Query keys and options for remote deck data.
 *
 * The sync mechanism in one sentence: the deck key contains the deck's
 * `revision`, which is a hash of its bank's contents, so editing a word
 * produces a new key, the new key misses, the deck is refetched, and the old
 * entry is garbage-collected. Nothing has to "invalidate" anything, and nobody
 * has to remember to bump a version.
 */

export const dataKeys = {
  manifest: ["data", "manifest"] as const,
  deck: (deckId: string, revision: string) =>
    ["data", "deck", deckId, revision] as const,
  exerciseSet: (setId: string, revision: string) =>
    ["data", "exercise-set", setId, revision] as const,
  audioIndex: ["data", "audio-index"] as const,
};

/** Key prefixes used to sweep stale caches in `useSyncData`. */
const DECK_KEY_PREFIX = ["data", "deck"] as const;
const EXERCISE_SET_KEY_PREFIX = ["data", "exercise-set"] as const;

/**
 * Key for a deck we cannot resolve yet (or at all). Kept out of
 * `dataKeys.deck()` so it can never collide with a real revision.
 */
const unresolvedDeckKey = (deckId: string) =>
  ["data", "deck", deckId, "__unresolved__"] as const;

/** Same idea for an exercise set the manifest does not (yet) name. */
const unresolvedExerciseSetKey = (setId: string) =>
  ["data", "exercise-set", setId, "__unresolved__"] as const;

const EMPTY_AUDIO_INDEX: AudioIndex = {
  schemaVersion: DATA_SCHEMA_VERSION,
  voices: {},
  clips: {},
};

/**
 * The manifest is the freshness oracle, so it is never served stale: refetch on
 * every mount and treat cached copies as immediately outdated. A persisted
 * manifest is still useful - it is what lets the app render its deck list
 * offline while this refetch fails in the background.
 */
export function manifestQueryOptions(): UseQueryOptions<Manifest> {
  return {
    queryKey: dataKeys.manifest,
    queryFn: fetchManifest,
    staleTime: 0,
    refetchOnMount: "always",
  };
}

/**
 * A deck at a given revision is immutable - the revision *is* the hash of its
 * bank - so it never goes stale and never needs refetching.
 */
export function deckQueryOptions(summary: DeckSummary): UseQueryOptions<Deck> {
  return {
    queryKey: dataKeys.deck(summary.id, summary.revision),
    queryFn: () => fetchDeck(summary),
    staleTime: Number.POSITIVE_INFINITY,
  };
}

/**
 * An exercise set at a given revision is immutable, exactly like a deck: the
 * revision is the hash of its file.
 */
export function exerciseSetQueryOptions(
  summary: ExerciseSetSummary,
): UseQueryOptions<ExerciseSet> {
  return {
    queryKey: dataKeys.exerciseSet(summary.id, summary.revision),
    queryFn: () => fetchExerciseSet(summary),
    staleTime: Number.POSITIVE_INFINITY,
  };
}

/**
 * Missing audio is a normal state, not an error: clips are produced by a
 * separate workflow that may not have run yet, and the repo ships an empty
 * index. A 404 (or a host that answers 403 for missing objects) therefore
 * resolves to an empty index so `useSpeak` can quietly fall back to TTS.
 * Malformed audio data still throws - that is corruption, not absence.
 */
export function audioIndexQueryOptions(): UseQueryOptions<AudioIndex> {
  return {
    queryKey: dataKeys.audioIndex,
    queryFn: async () => {
      try {
        return await fetchAudioIndex();
      } catch (error) {
        if (
          error instanceof DataFetchError &&
          (error.status === 404 || error.status === 403)
        ) {
          return EMPTY_AUDIO_INDEX;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  };
}

export function useManifest(): UseQueryResult<Manifest> {
  return useQuery(manifestQueryOptions());
}

/**
 * Resolves the deck's `DeckSummary` from the manifest, then fetches the deck.
 *
 * Stays disabled (pending, not fetching) while the manifest is in flight, since
 * the revision that forms the cache key is not known until then. Once the
 * manifest has settled without producing a summary the result is an error, not
 * an endless loading state - the deck route reads that error and redirects.
 */
export function useDeck(deckId: string): UseQueryResult<Deck> {
  const manifest = useManifest();
  const summary = manifest.data?.decks.find((deck) => deck.id === deckId);

  const manifestSettled = manifest.isSuccess || manifest.isError;
  const manifestError = manifest.error;

  const options: UseQueryOptions<Deck> = summary
    ? deckQueryOptions(summary)
    : {
        queryKey: unresolvedDeckKey(deckId),
        queryFn: () =>
          Promise.reject(
            manifestError ??
              new Error(`Deck "${deckId}" is not in the manifest.`),
          ),
        enabled: manifestSettled,
        retry: false,
        gcTime: 0,
      };

  return useQuery(options);
}

/**
 * Resolves the set's summary from the manifest, then fetches the set — the
 * exact mirror of `useDeck`, including the disabled-while-unresolved state and
 * the error once the manifest has settled without producing a summary.
 */
export function useExerciseSet(setId: string): UseQueryResult<ExerciseSet> {
  const manifest = useManifest();
  const summary = manifest.data?.exerciseSets?.find((set) => set.id === setId);

  const manifestSettled = manifest.isSuccess || manifest.isError;
  const manifestError = manifest.error;

  const options: UseQueryOptions<ExerciseSet> = summary
    ? exerciseSetQueryOptions(summary)
    : {
        queryKey: unresolvedExerciseSetKey(setId),
        queryFn: () =>
          Promise.reject(
            manifestError ??
              new Error(`Exercise set "${setId}" is not in the manifest.`),
          ),
        enabled: manifestSettled,
        retry: false,
        gcTime: 0,
      };

  return useQuery(options);
}

export function useAudioIndex(): UseQueryResult<AudioIndex> {
  return useQuery(audioIndexQueryOptions());
}

/**
 * "Check for updates": refetch the manifest, then drop every cached deck whose
 * revision the manifest no longer lists (superseded revisions and decks that
 * have been removed outright). The current revisions survive untouched, so this
 * costs nothing when everything is already up to date.
 */
export function useSyncData(): UseMutationResult<
  Manifest,
  Error,
  void,
  unknown
> {
  const queryClient = useQueryClient();

  return useMutation<Manifest, Error, void>({
    mutationFn: async () => {
      const manifest = await queryClient.fetchQuery({
        ...manifestQueryOptions(),
        staleTime: 0,
      });

      const currentRevisions = new Map(
        manifest.decks.map((deck) => [deck.id, deck.revision]),
      );
      const currentSetRevisions = new Map(
        (manifest.exerciseSets ?? []).map((set) => [set.id, set.revision]),
      );

      for (const query of queryClient
        .getQueryCache()
        .findAll({ queryKey: DECK_KEY_PREFIX })) {
        const [, , deckId, revision] = query.queryKey as readonly unknown[];
        if (
          typeof deckId !== "string" ||
          currentRevisions.get(deckId) !== revision
        ) {
          queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
        }
      }

      for (const query of queryClient
        .getQueryCache()
        .findAll({ queryKey: EXERCISE_SET_KEY_PREFIX })) {
        const [, , setId, revision] = query.queryKey as readonly unknown[];
        if (
          typeof setId !== "string" ||
          currentSetRevisions.get(setId) !== revision
        ) {
          queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
        }
      }

      return manifest;
    },
  });
}

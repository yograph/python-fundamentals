import { getRouteApi, Link } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  PlayIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DeckHeader, DeckHeaderSkeleton } from "@/features/decks/deck-header";
import { DirectionSwitch } from "@/features/decks/direction-switch";
import { countKnownEntries } from "@/features/decks/known-count";
import { ResetProgressButton } from "@/features/decks/reset-progress-button";
import { TagFilter } from "@/features/decks/tag-filter";
import { WordList, WordListSkeleton } from "@/features/decks/word-list";
import { resolveDirection } from "@/features/study/directions";
import { selectWords } from "@/features/study/session-queue";
import { useDeck, useManifest } from "@/lib/data/queries";
import { useDeckProgress, useResetDeckProgress } from "@/lib/progress/queries";
import { countKnown } from "@/lib/progress/store";
import { cn } from "@/lib/utils";
import type { StudyDirection } from "@/types/session";

const routeApi = getRouteApi("/deck/$deckId");

/**
 * The deck's own page: what is in it, how it will be asked, and one button to
 * start.
 *
 * It renders in two waves on purpose. The manifest gives the name, colour, icon
 * and word count, so the header and the options appear immediately; the bank
 * arrives a moment later and fills in the word list and the topic list. Nothing
 * waits for everything.
 */
export function DeckPage() {
  const { deckId } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();

  // An absent `direction` means the default: the search string carries choices
  // the learner made, not defaults nobody chose.
  const direction = resolveDirection(search.direction);

  const manifest = useManifest();
  const deck = useDeck(deckId);
  const progress = useDeckProgress(deckId);
  const resetProgress = useResetDeckProgress(deckId);

  const summary = manifest.data?.decks.find((entry) => entry.id === deckId);
  const isMissing = manifest.isSuccess && !summary;

  useEffect(() => {
    if (!isMissing) return;

    toast.error("That deck is not available", {
      description: "It may have been renamed or removed.",
    });
    void navigate({ to: "/", replace: true });
  }, [isMissing, navigate]);

  // Topics come from the words themselves, not from the manifest: this page
  // fetches the bank anyway, and a denormalized copy could only drift.
  const allTags = useMemo(
    () =>
      deck.data
        ? [...new Set(deck.data.words.flatMap((word) => word.tags))].sort()
        : null,
    [deck.data],
  );

  /**
   * A hand-edited `?tags=` can name topics this deck does not have, and naming
   * all of them is the same as naming none. Both reduce to "no filter" so the
   * page never shows a selection it cannot honour.
   */
  const selectedTags = useMemo(() => {
    if (!search.tags || !allTags) return null;

    const known = search.tags.filter((tag) => allTags.includes(tag));
    return known.length > 0 && known.length < allTags.length ? known : null;
  }, [search.tags, allTags]);

  const words = useMemo(
    () => (deck.data ? selectWords(deck.data, selectedTags) : null),
    [deck.data, selectedTags],
  );

  const known = useMemo(() => {
    if (!progress.data) return 0;
    if (deck.data) return countKnown(deck.data, progress.data);
    return Math.min(countKnownEntries(progress.data), summary?.wordCount ?? 0);
  }, [deck.data, progress.data, summary?.wordCount]);

  // Options live in the URL, so they survive a refresh and carry into the
  // session. `replace` keeps every flip of the switch out of the back stack -
  // "back" should return to the deck grid, not undo a toggle.
  const setDirection = useCallback(
    (next: StudyDirection) => {
      void navigate({
        search: (previous) => ({ ...previous, direction: next }),
        replace: true,
      });
    },
    [navigate],
  );

  const setTags = useCallback(
    (next: string[] | null) => {
      void navigate({
        search: (previous) => ({ ...previous, tags: next ?? undefined }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleReset = () => {
    resetProgress.mutate(undefined, {
      onSuccess: () => toast.success("Progress reset for this deck"),
      onError: (error) =>
        toast.error("Could not reset progress", {
          description: error.message,
        }),
    });
  };

  const canStart = words === null || words.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="-ml-2 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon-lg" aria-label="All decks">
          <Link to="/">
            <ChevronLeftIcon />
          </Link>
        </Button>
        <Link
          to="/"
          className="rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Decks
        </Link>
      </div>

      {summary ? (
        <DeckHeader
          name={summary.name}
          icon={summary.icon}
          color={summary.color}
          wordCount={summary.wordCount}
          known={known}
        />
      ) : (
        <DeckHeaderSkeleton />
      )}

      {summary ? (
        <>
          <div className="flex flex-col gap-1">
            <DirectionSwitch
              languages={summary.languages}
              direction={direction}
              onChange={setDirection}
            />
            <TagFilter
              tags={allTags}
              selected={selectedTags}
              onChange={setTags}
            />
          </div>

          <div className="flex flex-col gap-2">
            {canStart ? (
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link
                  to="/deck/$deckId/study"
                  params={{ deckId }}
                  // Passed through rather than resolved: if the learner never
                  // touched the switch, the session link stays free of a
                  // direction param too.
                  search={{
                    tags: selectedTags ?? undefined,
                    direction: search.direction,
                  }}
                >
                  <PlayIcon />
                  {known > 0 ? "Continue studying" : "Start studying"}
                </Link>
              </Button>
            ) : (
              <Button size="lg" disabled className="h-12 w-full text-base">
                No words in this selection
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {words === null
                ? "Loading words…"
                : selectedTags
                  ? `${words.length} of ${summary.wordCount} words selected`
                  : `${words.length} words`}
            </p>
          </div>

          {deck.isError ? (
            <DeckError
              message={
                deck.error instanceof Error
                  ? deck.error.message
                  : "This deck could not be loaded."
              }
              isRetrying={deck.isFetching}
              onRetry={() => void deck.refetch()}
            />
          ) : words ? (
            <WordList
              words={words}
              languages={summary.languages}
              direction={direction}
            />
          ) : (
            <WordListSkeleton />
          )}

          <ResetProgressButton
            isResetting={resetProgress.isPending}
            onReset={handleReset}
          />
        </>
      ) : manifest.isError ? (
        <DeckError
          message={
            manifest.error instanceof Error
              ? manifest.error.message
              : "This deck could not be loaded."
          }
          isRetrying={manifest.isFetching}
          onRetry={() => void manifest.refetch()}
        />
      ) : (
        <WordListSkeleton />
      )}
    </div>
  );
}

interface DeckErrorProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

function DeckError({ message, isRetrying, onRetry }: DeckErrorProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Could not load this deck</p>
        <p className="max-w-md text-sm break-words text-muted-foreground">
          {message}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          size="lg"
          className="h-11"
          disabled={isRetrying}
          onClick={onRetry}
        >
          <RefreshCwIcon className={cn(isRetrying && "animate-spin")} />
          Try again
        </Button>
        <Button asChild variant="outline" size="lg" className="h-11">
          <Link to="/">Back to decks</Link>
        </Button>
      </div>
    </div>
  );
}

import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  describeDirection,
  resolveDirection,
} from "@/features/study/directions";
import { StudySession } from "@/features/study/study-session";
import { StudySkeleton } from "@/features/study/study-skeleton";
import { useDeck, useManifest } from "@/lib/data/queries";
import { useDeckProgress } from "@/lib/progress/queries";

const routeApi = getRouteApi("/deck/$deckId/study");

/**
 * The session. Its whole configuration lives in the URL - the deck in the path,
 * the tag filter and the direction in the search string - so a refresh resumes
 * the same session and a link opens it.
 *
 * The page owns the chrome (which deck, which direction, how to get back) and
 * nothing else: everything about running the session is `StudySession`'s.
 */
export function StudyPage() {
  const { deckId } = routeApi.useParams();
  const search = routeApi.useSearch();
  const navigate = useNavigate();

  // Resolved once, here: `direction` is optional in the URL, and nothing below
  // this line should have to think about that.
  const direction = resolveDirection(search.direction);
  const tags = search.tags;

  const manifest = useManifest();
  const deck = useDeck(deckId);
  const progress = useDeckProgress(deckId);

  const summary = manifest.data?.decks.find((entry) => entry.id === deckId);
  const isMissing = manifest.isSuccess && !summary;

  // A study session has nothing to show without a deck, and no error state
  // worth its own layout: it hands the learner back to the grid with a reason.
  // The ref makes that a one-way trip - a missing deck also fails `useDeck`, so
  // both conditions arrive, one render apart.
  const hasBounced = useRef(false);

  useEffect(() => {
    if (hasBounced.current) return;
    if (!isMissing && !deck.isError) return;

    hasBounced.current = true;
    toast.error(
      isMissing ? "That deck is not available" : "Could not load that deck",
      {
        description: isMissing
          ? "It may have been renamed or removed."
          : "Check your connection and try again.",
      },
    );
    void navigate({ to: "/", replace: true });
  }, [isMissing, deck.isError, navigate]);

  const languages = deck.data?.languages ?? summary?.languages;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          aria-label="Back to deck"
        >
          {/* Back to the deck, not to the grid, and carrying the same options -
              so leaving a session and starting another one is one tap each. */}
          <Link
            to="/deck/$deckId"
            params={{ deckId }}
            search={{ tags, direction: search.direction }}
          >
            <ChevronLeftIcon />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading truncate text-xl font-semibold">
            {deck.data?.name ?? summary?.name ?? "Deck"}
          </h1>
          {languages ? (
            <p className="text-sm text-muted-foreground">
              {describeDirection(languages, direction)}
            </p>
          ) : null}
        </div>
      </header>

      {tags && tags.length > 0 ? (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline">
              #{tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {deck.data && progress.data ? (
        <StudySession
          deck={deck.data}
          progress={progress.data}
          tags={tags ?? null}
          direction={direction}
        />
      ) : (
        <StudySkeleton />
      )}
    </div>
  );
}

import { Fragment } from "react";

import { RichText } from "@/components/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { directionEndpoints, orientWord } from "@/features/study/directions";
import { cn } from "@/lib/utils";
import type { DeckLanguages, Word } from "@/types/deck";
import type { StudyDirection } from "@/types/session";

/**
 * `py-2.5` plus `leading-relaxed` is the comfortable-density point for this many
 * rows: loose enough to scan, tight enough that a deck is still a page rather
 * than a scroll marathon.
 */
const CELL_CLASS = "py-2.5 leading-relaxed break-words";

interface WordListProps {
  words: Word[];
  languages: DeckLanguages;
  /** Decides which side is the left column - see `orientWord`. */
  direction: StudyDirection;
}

/**
 * The deck's word pairs, as something you can actually read.
 *
 * Three decisions worth keeping:
 *
 * 1. **One language per column, not both sides of a card.** The pair is the
 *    interesting thing, and the direction switch decides which half is the
 *    prompt - so the columns swap with it, and the header labels swap with them.
 * 2. **A `<dl>` on a two-column grid.** Term/definition is what these rows are,
 *    and making the `dt`/`dd` pairs direct grid children is what keeps the
 *    columns aligned down a list of 120-odd rows. Nested flex rows drift as soon
 *    as one entry wraps.
 * 3. **Wrap, never truncate.** Some fronts carry a whole construction
 *    (`door ... trokken (trekken (door))`); an ellipsis would hide the part that
 *    makes them worth reading.
 */
export function WordList({ words, languages, direction }: WordListProps) {
  const { from, to } = directionEndpoints(languages, direction);

  if (words.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No words match the selected topics.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-1" aria-label="Words in this deck">
      <div className="grid grid-cols-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span className="px-3">{from}</span>
        <span className="pr-3 pl-1">{to}</span>
      </div>

      <dl className="grid grid-cols-2 overflow-hidden rounded-xl">
        {words.map((word, index) => {
          const { prompt, answer } = orientWord(word, direction);
          // Zebra rather than rules: on a phone, a tinted band is what carries
          // the eye from a wrapped prompt across to its answer.
          const striped = index % 2 === 1;

          return (
            <Fragment key={word.id}>
              <dt
                className={cn(
                  CELL_CLASS,
                  "px-3 text-base",
                  striped && "bg-muted/50",
                )}
              >
                <RichText text={prompt} />
              </dt>
              <dd
                className={cn(
                  CELL_CLASS,
                  "pr-3 pl-1 text-base text-muted-foreground",
                  striped && "bg-muted/50",
                )}
              >
                <RichText text={answer} />
              </dd>
            </Fragment>
          );
        })}
      </dl>
    </section>
  );
}

export function WordListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <section className="flex flex-col gap-3" aria-hidden="true">
      <div className="grid grid-cols-2 gap-x-4 px-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          key={index}
          className="grid grid-cols-2 gap-x-4 px-3"
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </section>
  );
}

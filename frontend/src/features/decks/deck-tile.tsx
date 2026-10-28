import { Link } from "@tanstack/react-router";
import { AlignLeftIcon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useDeckProgress } from "@/lib/progress/queries";
import type { DeckSummary } from "@/types/deck";

import { DeckIcon } from "./deck-icon";
import { countKnownEntries } from "./known-count";

/**
 * A square, deck-coloured tile linking to the deck's page. Everything shown
 * comes from the manifest plus local progress, so the overview never has to
 * fetch a deck file - which is the whole reason the manifest carries
 * `wordCount`.
 */
export function DeckTile({ deck }: { deck: DeckSummary }) {
  const progress = useDeckProgress(deck.id);
  const known = Math.min(countKnownEntries(progress.data), deck.wordCount);
  const percent =
    deck.wordCount > 0 ? Math.round((known / deck.wordCount) * 100) : 0;

  return (
    // The link is an overlay rather than a wrapper so that the tile can contain
    // block content (the progress bar) and still be one real anchor.
    <div
      className="relative aspect-square overflow-hidden rounded-xl text-white shadow-sm transition-transform has-[a:active]:scale-[0.99] has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50"
      style={{ backgroundColor: deck.color }}
    >
      <div className="pointer-events-none flex h-full flex-col justify-between gap-2 p-4">
        <h2 className="font-heading text-lg leading-tight font-semibold">
          {deck.name}
        </h2>
        <DeckIcon
          name={deck.icon}
          className="mx-auto size-12 stroke-1 opacity-40"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <AlignLeftIcon className="size-4" />
              {deck.wordCount}
            </span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <Progress
            value={percent}
            className="bg-white/25 *:data-[slot=progress-indicator]:bg-white"
          />
        </div>
      </div>
      <Link
        to="/deck/$deckId"
        params={{ deckId: deck.id }}
        aria-label={`Open ${deck.name}: ${known} of ${deck.wordCount} words known`}
        className="absolute inset-0 outline-none active:bg-black/5"
      />
    </div>
  );
}

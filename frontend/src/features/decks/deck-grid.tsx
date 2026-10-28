import { Skeleton } from "@/components/ui/skeleton";
import type { DeckSummary } from "@/types/deck";

import { DeckTile } from "./deck-tile";

const GRID_CLASS = "grid grid-cols-2 gap-4 sm:grid-cols-3";

export function DeckGrid({ decks }: { decks: DeckSummary[] }) {
  return (
    <div className={GRID_CLASS}>
      {decks.map((deck) => (
        <DeckTile key={deck.id} deck={deck} />
      ))}
    </div>
  );
}

export function DeckGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          key={index}
          className="aspect-square rounded-xl"
        />
      ))}
    </div>
  );
}

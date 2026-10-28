import { Skeleton } from "@/components/ui/skeleton";
import type { ExerciseSetSummary } from "@/types/exercise";

import { PracticeTile } from "./practice-tile";

const GRID_CLASS = "grid grid-cols-2 gap-4 sm:grid-cols-3";

export function PracticeGrid({ sets }: { sets: ExerciseSetSummary[] }) {
  return (
    <div className={GRID_CLASS}>
      {sets.map((set) => (
        <PracticeTile key={set.id} set={set} />
      ))}
    </div>
  );
}

export function PracticeGridSkeleton({ count = 3 }: { count?: number }) {
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

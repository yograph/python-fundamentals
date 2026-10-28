import { Link } from "@tanstack/react-router";
import { ListChecksIcon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { DeckIcon } from "@/features/decks/deck-icon";
import { usePracticeProgress } from "@/lib/progress/practice-queries";
import { countCorrectEntries } from "@/lib/progress/practice-store";
import type { ExerciseSetSummary } from "@/types/exercise";

/**
 * A square tile linking to a practice set, the practice counterpart of
 * `DeckTile`. Everything shown comes from the manifest plus local progress —
 * the overview never fetches an exercise file.
 */
export function PracticeTile({ set }: { set: ExerciseSetSummary }) {
  const progress = usePracticeProgress(set.id);
  const correct = Math.min(
    countCorrectEntries(progress.data),
    set.exerciseCount,
  );
  const percent =
    set.exerciseCount > 0 ? Math.round((correct / set.exerciseCount) * 100) : 0;

  return (
    <div
      className="relative aspect-square overflow-hidden rounded-xl text-white shadow-sm transition-transform has-[a:active]:scale-[0.99] has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50"
      style={{ backgroundColor: set.color }}
    >
      <div className="pointer-events-none flex h-full flex-col justify-between gap-2 p-4">
        <div>
          <p className="text-xs font-medium tracking-wide uppercase opacity-75">
            {set.course ?? set.kind}
          </p>
          <h3 className="font-heading text-lg leading-tight font-semibold">
            {set.name}
          </h3>
        </div>
        <DeckIcon
          name={set.icon}
          className="mx-auto size-12 stroke-1 opacity-40"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <ListChecksIcon className="size-4" />
              {set.exerciseCount}
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
        to="/practice/$setId"
        params={{ setId: set.id }}
        aria-label={`Open ${set.name}: ${correct} of ${set.exerciseCount} exercises correct`}
        className="absolute inset-0 outline-none active:bg-black/5"
      />
    </div>
  );
}

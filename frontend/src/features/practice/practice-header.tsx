import type { CSSProperties } from "react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DeckIcon } from "@/features/decks/deck-icon";

interface PracticeHeaderProps {
  name: string;
  /** Icon name from the set's `icon` field; unknown names fall back. */
  icon: string | undefined;
  color: string;
  /** e.g. "grammar", or the set's course — shown with the level as the subtitle. */
  kind: string;
  level: string | undefined;
  exerciseCount: number;
  correct: number;
}

/** The set's identity and the learner's standing in it; mirrors `DeckHeader`. */
export function PracticeHeader({
  name,
  icon,
  color,
  kind,
  level,
  exerciseCount,
  correct,
}: PracticeHeaderProps) {
  const clamped = Math.min(correct, exerciseCount);
  const percent =
    exerciseCount > 0 ? Math.round((clamped / exerciseCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          <DeckIcon name={icon} className="size-6 stroke-[1.5]" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
            {name}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="capitalize">{kind}</span>
            {level ? ` · ${level}` : null}
            <span aria-hidden="true"> · </span>
            {exerciseCount} exercises
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{clamped}</span> correct
          </p>
        </div>
      </div>
      <Progress
        value={percent}
        aria-label={`${percent}% of this set is marked correct`}
        className="h-1.5 *:data-[slot=progress-indicator]:bg-[var(--set-accent)]"
        style={{ "--set-accent": color } as CSSProperties}
      />
    </div>
  );
}

export function PracticeHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  );
}

import type { CSSProperties } from "react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface CourseHeaderProps {
  name: string;
  color: string;
  level: string | undefined;
  lessonCount: number;
  exerciseCount: number;
  /** Coding labs in the level; 0 hides the count. */
  labCount?: number;
  correct: number;
}

/** A course level's identity and the learner's standing in it. */
export function CourseHeader({
  name,
  color,
  level,
  lessonCount,
  exerciseCount,
  labCount = 0,
  correct,
}: CourseHeaderProps) {
  const clamped = Math.min(correct, exerciseCount);
  const percent =
    exerciseCount > 0 ? Math.round((clamped / exerciseCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="font-heading flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          {level ?? "·"}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
            {name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lessonCount} lessons
            <span aria-hidden="true"> · </span>
            {exerciseCount} exercises
            {labCount > 0 ? (
              <>
                <span aria-hidden="true"> · </span>
                {labCount} labs
              </>
            ) : null}
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">{clamped}</span> correct
          </p>
        </div>
      </div>
      <Progress
        value={percent}
        aria-label={`${percent}% of this level's exercises are marked correct`}
        className="h-1.5 *:data-[slot=progress-indicator]:bg-[var(--set-accent)]"
        style={{ "--set-accent": color } as CSSProperties}
      />
    </div>
  );
}

export function CourseHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
    </div>
  );
}

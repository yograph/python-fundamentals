import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { GrammarLesson } from "@/types/exercise";

import {
  isLessonDone,
  type LessonStanding,
  percentOf,
} from "./lesson-progress";

interface LessonListProps {
  setId: string;
  color: string;
  lessons: GrammarLesson[];
  standings: Map<string, LessonStanding>;
}

/**
 * The level's table of contents. Numbered, because the order is the course:
 * later lessons lean on earlier ones. A finished lesson trades its number for
 * a check, so the first numbered row is where to pick up.
 */
export function LessonList({
  setId,
  color,
  lessons,
  standings,
}: LessonListProps) {
  return (
    <ol
      className="flex flex-col divide-y overflow-hidden rounded-xl border"
      style={{ "--set-accent": color } as CSSProperties}
    >
      {lessons.map((lesson, index) => {
        const standing = standings.get(lesson.id) ?? { total: 0, correct: 0 };
        const done = isLessonDone(standing);
        const percent = percentOf(standing);

        return (
          <li key={lesson.id}>
            <Link
              to="/grammar/$setId/$lessonId"
              params={{ setId, lessonId: lesson.id }}
              className="flex items-center gap-3 px-3 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/60 active:bg-muted"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  done
                    ? "bg-[var(--set-accent)] text-white"
                    : "border-2 border-[var(--set-accent)] text-[var(--set-accent)]",
                )}
              >
                {done ? (
                  <CheckIcon className="size-4" aria-label="Done" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="leading-snug font-medium">{lesson.title}</span>
                <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                  {lesson.summary}
                </span>
                {standing.total > 0 ? (
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-[var(--set-accent)]"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="tabular-nums">
                      {Math.min(standing.correct, standing.total)}/
                      {standing.total} correct
                    </span>
                  </span>
                ) : null}
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function LessonListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          key={index}
          className="h-16 w-full rounded-lg"
        />
      ))}
    </div>
  );
}

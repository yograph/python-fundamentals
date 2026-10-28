import { Link } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { PracticeTile } from "@/features/practice/practice-tile";
import { usePracticeProgress } from "@/lib/progress/practice-queries";
import { countCorrectEntries } from "@/lib/progress/practice-store";
import type { ExerciseSetSummary } from "@/types/exercise";

const GRID_CLASS = "grid grid-cols-2 gap-4 sm:grid-cols-3";

/**
 * A course's sets, one tile each, in library order. Levels with lessons open
 * their lesson list; a set without lessons (a course's standalone quiz) opens
 * straight into practice.
 */
export function CourseGrid({ sets }: { sets: ExerciseSetSummary[] }) {
  return (
    <div className={GRID_CLASS}>
      {sets.map((set) =>
        set.lessonCount ? (
          <CourseTile key={set.id} set={set} />
        ) : (
          <PracticeTile key={set.id} set={set} />
        ),
      )}
    </div>
  );
}

/**
 * One level of the course. Like every overview tile it renders from the
 * manifest plus local progress alone: the lesson count is derived into the
 * manifest so the grid never fetches a set file.
 */
function CourseTile({ set }: { set: ExerciseSetSummary }) {
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
            {set.course ?? "Grammar course"}
          </p>
          <h3 className="font-heading text-lg leading-tight font-semibold">
            {set.name}
          </h3>
        </div>
        <p
          aria-hidden="true"
          className="font-heading text-center text-5xl font-semibold tracking-tight opacity-50"
        >
          {set.level ?? ""}
        </p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <BookOpenIcon className="size-4" />
              {set.lessonCount} lessons
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
        to="/grammar/$setId"
        params={{ setId: set.id }}
        aria-label={`Open ${set.name}: ${set.lessonCount} lessons, ${correct} of ${set.exerciseCount} exercises correct`}
        className="absolute inset-0 outline-none active:bg-black/5"
      />
    </div>
  );
}

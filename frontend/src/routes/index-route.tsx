import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Fragment } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeckGrid, DeckGridSkeleton } from "@/features/decks/deck-grid";
import { CourseGrid } from "@/features/grammar/course-grid";
import { PracticeGrid } from "@/features/practice/practice-grid";
import { useManifest, useSyncData } from "@/lib/data/queries";
import { cn } from "@/lib/utils";
import type { ExerciseSetSummary } from "@/types/exercise";

/**
 * The overview: decks, the grammar course, any other named courses, then the
 * remaining practice sets — or, when the site is a single named course, just
 * that course. Renders entirely from the manifest.
 */
export function OverviewPage() {
  const manifest = useManifest();
  const sync = useSyncData();

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: () => toast.success("Everything is up to date"),
      onError: (error) =>
        toast.error("Could not refresh", {
          description: error.message,
        }),
    });
  };

  const decks = manifest.data?.decks;
  // Sets that name a course get a section per course. Of the rest, a grammar
  // set that carries lessons is a level of the grammar course, shown in its
  // own section; everything else stays a plain practice set.
  const namedCourses = groupByCourse(manifest.data?.exerciseSets ?? []);
  const courseSets = manifest.data?.exerciseSets?.filter(
    (set) => !set.course && (set.lessonCount ?? 0) > 0,
  );
  const exerciseSets = manifest.data?.exerciseSets?.filter(
    (set) => !set.course && !set.lessonCount,
  );
  // A site that is one named course and nothing else is that course: its
  // name heads the page and its sets fill it, with no section headings.
  const soleCourse =
    decks?.length === 0 &&
    namedCourses.size === 1 &&
    courseSets?.length === 0 &&
    exerciseSets?.length === 0
      ? [...namedCourses][0]
      : null;
  const title = soleCourse ? soleCourse[0] : manifest.data ? "Decks" : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        {title ? (
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {title}
          </h1>
        ) : manifest.isPending ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <span />
        )}
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Refresh"
          disabled={sync.isPending}
          onClick={handleSync}
        >
          <RefreshCwIcon className={cn(sync.isPending && "animate-spin")} />
        </Button>
      </header>

      {soleCourse ? (
        <CourseGrid sets={soleCourse[1]} />
      ) : decks ? (
        decks.length > 0 ? (
          <DeckGrid decks={decks} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No decks published yet.
          </p>
        )
      ) : manifest.isPending ? (
        <DeckGridSkeleton />
      ) : (
        <ManifestError
          message={
            manifest.error instanceof Error
              ? manifest.error.message
              : "The overview could not be loaded."
          }
          isRetrying={sync.isPending}
          onRetry={handleSync}
        />
      )}

      {courseSets && courseSets.length > 0 ? (
        <>
          <header className="mt-4 flex flex-col gap-1">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Grammar course
            </h2>
            <p className="text-sm text-muted-foreground">
              Every grammar topic from A1 to C1, with lessons and exercises.
            </p>
          </header>
          <CourseGrid sets={courseSets} />
        </>
      ) : null}

      {soleCourse
        ? null
        : [...namedCourses].map(([course, sets]) => (
            <Fragment key={course}>
              <header className="mt-4 flex flex-col gap-1">
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  {course}
                </h2>
              </header>
              <CourseGrid sets={sets} />
            </Fragment>
          ))}

      {/* Practice appears only when the manifest lists sets: a data payload
          without them renders exactly the overview it always did. */}
      {exerciseSets && exerciseSets.length > 0 ? (
        <>
          <header className="mt-4 flex items-center justify-between gap-4">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Practice
            </h2>
          </header>
          <PracticeGrid sets={exerciseSets} />
        </>
      ) : null}
    </div>
  );
}

/** Sets that name a course, by course, both in library order. */
function groupByCourse(
  sets: ExerciseSetSummary[],
): Map<string, ExerciseSetSummary[]> {
  const courses = new Map<string, ExerciseSetSummary[]>();
  for (const set of sets) {
    if (!set.course) continue;
    courses.set(set.course, [...(courses.get(set.course) ?? []), set]);
  }
  return courses;
}

interface ManifestErrorProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

function ManifestError({ message, isRetrying, onRetry }: ManifestErrorProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Could not load the overview</p>
        <p className="max-w-md text-sm break-words text-muted-foreground">
          {message}
        </p>
      </div>
      <Button
        size="lg"
        className="h-11"
        disabled={isRetrying}
        onClick={onRetry}
      >
        <RefreshCwIcon className={cn(isRetrying && "animate-spin")} />
        Try again
      </Button>
    </div>
  );
}

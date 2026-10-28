import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { BookOpenIcon, ChevronLeftIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { lessonExercises } from "@/features/grammar/lesson-progress";
import {
  PracticeHeader,
  PracticeHeaderSkeleton,
} from "@/features/practice/practice-header";
import { PracticeSession } from "@/features/practice/practice-session";
import { useExerciseSet, useManifest } from "@/lib/data/queries";
import { usePracticeProgress } from "@/lib/progress/practice-queries";
import {
  countCorrect,
  countCorrectEntries,
} from "@/lib/progress/practice-store";
import type { ExerciseSet } from "@/types/exercise";

const routeApi = getRouteApi("/practice/$setId");

/**
 * A practice set's page: header, then the session itself. Unlike a deck there
 * is no separate "start" step — a set has no direction or tag options to pick,
 * so the first exercise (always one that still needs work) renders as soon as
 * the set arrives.
 *
 * With `?lesson=`, the round is one grammar lesson's exercises: the same
 * session over a narrowed copy of the set, so progress lands in the level's
 * store exactly as a whole-level round's would.
 */
export function PracticePage() {
  const { setId } = routeApi.useParams();
  const { lesson: lessonId } = routeApi.useSearch();
  const navigate = useNavigate();

  const manifest = useManifest();
  const set = useExerciseSet(setId);
  const progress = usePracticeProgress(setId);

  const summary = manifest.data?.exerciseSets?.find(
    (entry) => entry.id === setId,
  );
  const isMissing = manifest.isSuccess && !summary;

  // Same one-way bounce as the study route: nothing to show without a set.
  const hasBounced = useRef(false);

  useEffect(() => {
    if (hasBounced.current) return;
    if (!isMissing && !set.isError) return;

    hasBounced.current = true;
    toast.error(
      isMissing
        ? "That practice set is not available"
        : "Could not load that practice set",
      {
        description: isMissing
          ? "It may have been renamed or removed."
          : "Check your connection and try again.",
      },
    );
    void navigate({ to: "/", replace: true });
  }, [isMissing, set.isError, navigate]);

  // A lesson id the set does not have degrades to the whole set, the way an
  // unknown tag filter does on a deck page.
  const lesson =
    lessonId && set.data?.kind === "grammar"
      ? (set.data.lessons.find((entry) => entry.id === lessonId) ?? null)
      : null;
  const isCourse = (summary?.lessonCount ?? 0) > 0;

  const practiceSet = useMemo((): ExerciseSet | undefined => {
    if (!set.data || !lesson || set.data.kind !== "grammar") return set.data;
    return {
      ...set.data,
      name: lesson.title,
      exercises: lessonExercises(set.data, lesson.id),
    };
  }, [set.data, lesson]);

  // Same two-source pattern as the deck page: the exact count once the set is
  // loaded, and until then the stored-entry count clamped to the manifest's.
  const correct = useMemo(() => {
    if (!progress.data) return 0;
    if (practiceSet) return countCorrect(practiceSet, progress.data);
    return Math.min(
      countCorrectEntries(progress.data),
      summary?.exerciseCount ?? 0,
    );
  }, [practiceSet, progress.data, summary?.exerciseCount]);

  /** Lesson rounds go back to the lesson; course rounds to the level. */
  const back = lesson
    ? ({
        to: "/grammar/$setId/$lessonId",
        params: { setId, lessonId: lesson.id },
        label: "Back to the lesson",
        crumb: lesson.title,
      } as const)
    : isCourse
      ? ({
          to: "/grammar/$setId",
          params: { setId },
          label: "Back to the lessons",
          crumb: summary?.name ?? "Lessons",
        } as const)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="-ml-2 flex items-center gap-1">
        {back ? (
          <>
            <Button
              asChild
              variant="ghost"
              size="icon-lg"
              aria-label={back.label}
            >
              <Link to={back.to} params={back.params}>
                <ChevronLeftIcon />
              </Link>
            </Button>
            <Link
              to={back.to}
              params={back.params}
              className="truncate rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {back.crumb}
            </Link>
          </>
        ) : (
          <>
            <Button
              asChild
              variant="ghost"
              size="icon-lg"
              aria-label="Overview"
            >
              <Link to="/">
                <ChevronLeftIcon />
              </Link>
            </Button>
            <Link
              to="/"
              className="rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {summary?.course ?? "Practice"}
            </Link>
          </>
        )}
      </div>

      {summary && (!lessonId || set.data) ? (
        <PracticeHeader
          name={lesson ? lesson.title : summary.name}
          icon={summary.icon}
          color={summary.color}
          kind={lesson ? "lesson" : (summary.course ?? summary.kind)}
          level={summary.level}
          exerciseCount={practiceSet?.exercises.length ?? summary.exerciseCount}
          correct={correct}
        />
      ) : (
        <PracticeHeaderSkeleton />
      )}

      {practiceSet && progress.data ? (
        // Keyed by set identity: the session snapshots a queue of indices into
        // set.exercises, so a different set (or revision, or lesson) must
        // remount it rather than have stale indices applied to a new array.
        <PracticeSession
          key={`${practiceSet.id}:${practiceSet.revision}:${lesson?.id ?? ""}`}
          set={practiceSet}
          progress={progress.data}
          isPartial={lesson !== null}
          backAction={
            back ? (
              <Button asChild variant="outline" size="lg" className="h-11">
                <Link to={back.to} params={back.params}>
                  <BookOpenIcon />
                  {back.label}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <PracticeSessionSkeleton />
      )}
    </div>
  );
}

function PracticeSessionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-6 w-3/4" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}

import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, ListChecksIcon, PlayIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  CourseHeader,
  CourseHeaderSkeleton,
} from "@/features/grammar/course-header";
import { LessonList, LessonListSkeleton } from "@/features/grammar/lesson-list";
import {
  isLessonDone,
  lessonStandings,
} from "@/features/grammar/lesson-progress";
import { useExerciseSet, useManifest } from "@/lib/data/queries";
import { usePracticeProgress } from "@/lib/progress/practice-queries";
import {
  countCorrect,
  countCorrectEntries,
} from "@/lib/progress/practice-store";

const routeApi = getRouteApi("/grammar/$setId");

/**
 * One level of the grammar course: its lessons in order, where to pick up, and
 * a way to practise the whole level at once.
 *
 * Renders in the same two waves as a deck page: the manifest gives the header
 * immediately, the set file fills in the lessons.
 */
export function CoursePage() {
  const { setId } = routeApi.useParams();
  const navigate = useNavigate();

  const manifest = useManifest();
  const set = useExerciseSet(setId);
  const progress = usePracticeProgress(setId);

  const summary = manifest.data?.exerciseSets?.find(
    (entry) => entry.id === setId,
  );
  const isMissing = manifest.isSuccess && !summary;
  const grammar =
    set.data?.kind === "grammar" && set.data.lessons.length > 0
      ? set.data
      : null;
  // A set that loaded but has no lessons is a plain quiz: send it there.
  const isNotACourse = set.isSuccess && grammar === null;

  const hasBounced = useRef(false);

  useEffect(() => {
    if (hasBounced.current) return;
    if (isNotACourse) {
      hasBounced.current = true;
      void navigate({
        to: "/practice/$setId",
        params: { setId },
        replace: true,
      });
      return;
    }
    if (!isMissing && !set.isError) return;

    hasBounced.current = true;
    toast.error(
      isMissing
        ? "That course level is not available"
        : "Could not load that course level",
      {
        description: isMissing
          ? "It may have been renamed or removed."
          : "Check your connection and try again.",
      },
    );
    void navigate({ to: "/", replace: true });
  }, [isMissing, isNotACourse, set.isError, navigate, setId]);

  const standings = useMemo(
    () => (grammar ? lessonStandings(grammar, progress.data) : null),
    [grammar, progress.data],
  );

  const correct = useMemo(() => {
    if (!progress.data) return 0;
    if (set.data) return countCorrect(set.data, progress.data);
    return Math.min(
      countCorrectEntries(progress.data),
      summary?.exerciseCount ?? 0,
    );
  }, [set.data, progress.data, summary?.exerciseCount]);

  /** Where to pick up: the first lesson not yet fully correct. */
  const nextIndex = useMemo(() => {
    if (!grammar || !standings) return -1;
    const index = grammar.lessons.findIndex(
      (lesson) => !isLessonDone(standings.get(lesson.id)),
    );
    return index === -1 ? 0 : index;
  }, [grammar, standings]);
  const nextLesson = grammar?.lessons[nextIndex];
  const hasStarted = correct > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="-ml-2 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon-lg" aria-label="Overview">
          <Link to="/">
            <ChevronLeftIcon />
          </Link>
        </Button>
        <Link
          to="/"
          className="rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {summary?.course ?? "Grammar course"}
        </Link>
      </div>

      {summary ? (
        <CourseHeader
          name={summary.name}
          color={summary.color}
          level={summary.level}
          lessonCount={summary.lessonCount ?? grammar?.lessons.length ?? 0}
          exerciseCount={summary.exerciseCount}
          correct={correct}
        />
      ) : (
        <CourseHeaderSkeleton />
      )}

      {grammar && standings && summary ? (
        <>
          <div className="flex flex-col gap-2">
            {nextLesson ? (
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link
                  to="/grammar/$setId/$lessonId"
                  params={{ setId, lessonId: nextLesson.id }}
                >
                  <PlayIcon />
                  <span className="truncate">
                    {hasStarted ? "Continue" : "Start"}: {nextIndex + 1}.{" "}
                    {nextLesson.title}
                  </span>
                </Link>
              </Button>
            ) : null}
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 w-full text-base"
            >
              <Link to="/practice/$setId" params={{ setId }}>
                <ListChecksIcon />
                Practise the whole level
              </Link>
            </Button>
          </div>

          <section className="flex flex-col gap-2" aria-label="Lessons">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Lessons
            </h2>
            <LessonList
              setId={setId}
              color={summary.color}
              lessons={grammar.lessons}
              standings={standings}
            />
          </section>
        </>
      ) : (
        <LessonListSkeleton />
      )}
    </div>
  );
}

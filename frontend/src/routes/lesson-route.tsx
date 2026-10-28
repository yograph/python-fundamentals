import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ListChecksIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LessonBlocks } from "@/features/grammar/lesson-blocks";
import {
  isLessonDone,
  lessonStandings,
} from "@/features/grammar/lesson-progress";
import { useExerciseSet, useManifest } from "@/lib/data/queries";
import { usePracticeProgress } from "@/lib/progress/practice-queries";

const routeApi = getRouteApi("/grammar/$setId/$lessonId");

/**
 * A single lesson: the explanation, then a way into its exercises, then the
 * way to the next lesson. Reading and practising are separate pages on
 * purpose — a lesson is something to come back to, and its practice round is
 * the ordinary practice session, filtered to the lesson.
 */
export function LessonPage() {
  const { setId, lessonId } = routeApi.useParams();
  const navigate = useNavigate();

  const manifest = useManifest();
  const set = useExerciseSet(setId);
  const progress = usePracticeProgress(setId);

  const summary = manifest.data?.exerciseSets?.find(
    (entry) => entry.id === setId,
  );
  const grammar = set.data?.kind === "grammar" ? set.data : null;
  const index = grammar
    ? grammar.lessons.findIndex((lesson) => lesson.id === lessonId)
    : -1;
  const lesson = grammar && index !== -1 ? grammar.lessons[index] : null;
  const isMissing =
    (manifest.isSuccess && !summary) || (set.isSuccess && lesson === null);

  const hasBounced = useRef(false);

  useEffect(() => {
    if (hasBounced.current) return;
    if (!isMissing && !set.isError) return;

    hasBounced.current = true;
    toast.error(
      isMissing ? "That lesson is not available" : "Could not load that lesson",
      {
        description: isMissing
          ? "It may have been renamed or removed."
          : "Check your connection and try again.",
      },
    );
    // Back to the level if it still exists, otherwise all the way out.
    void (summary && !set.isError
      ? navigate({
          to: "/grammar/$setId",
          params: { setId },
          replace: true,
        })
      : navigate({ to: "/", replace: true }));
  }, [isMissing, set.isError, navigate, setId, summary]);

  const standing = useMemo(
    () =>
      grammar && lesson
        ? lessonStandings(grammar, progress.data).get(lesson.id)
        : undefined,
    [grammar, lesson, progress.data],
  );

  const previous = grammar && index > 0 ? grammar.lessons[index - 1] : null;
  const next =
    grammar && index !== -1 && index < grammar.lessons.length - 1
      ? grammar.lessons[index + 1]
      : null;
  const color = summary?.color ?? "#71717a";

  return (
    <article className="flex flex-col gap-6">
      <div className="-ml-2 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon-lg" aria-label="All lessons">
          <Link to="/grammar/$setId" params={{ setId }}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <Link
          to="/grammar/$setId"
          params={{ setId }}
          className="rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {summary?.name ?? "Lessons"}
        </Link>
      </div>

      {grammar && lesson ? (
        <>
          <header className="flex flex-col gap-2">
            <p
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color }}
            >
              {summary?.level ? `${summary.level} · ` : null}Lesson {index + 1}{" "}
              of {grammar.lessons.length}
            </p>
            <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight">
              {lesson.title}
            </h1>
            <p className="text-lg leading-relaxed text-muted-foreground">
              {lesson.summary}
            </p>
          </header>

          <LessonBlocks blocks={lesson.blocks} color={color} />

          {standing && standing.total > 0 ? (
            <section
              className="flex flex-col gap-3 rounded-xl border p-4"
              style={{ "--set-accent": color } as CSSProperties}
              aria-label="Practice"
            >
              <div>
                <h2 className="font-heading text-lg font-semibold">
                  {isLessonDone(standing)
                    ? "You have this lesson down"
                    : "Practise this lesson"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {standing.total} exercises ·{" "}
                  <span className="tabular-nums">
                    {Math.min(standing.correct, standing.total)}
                  </span>{" "}
                  correct so far
                </p>
              </div>
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link
                  to="/practice/$setId"
                  params={{ setId }}
                  search={{ lesson: lesson.id }}
                >
                  <ListChecksIcon />
                  {isLessonDone(standing)
                    ? "Practise again"
                    : "Start exercises"}
                </Link>
              </Button>
            </section>
          ) : null}

          <nav
            className="grid grid-cols-2 gap-2"
            aria-label="Previous and next lesson"
          >
            {previous ? (
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-12 justify-start py-2 whitespace-normal"
              >
                <Link
                  to="/grammar/$setId/$lessonId"
                  params={{ setId, lessonId: previous.id }}
                >
                  <ChevronLeftIcon />
                  <span className="flex min-w-0 flex-col items-start text-left">
                    <span className="text-xs text-muted-foreground">
                      Previous
                    </span>
                    <span className="line-clamp-2">{previous.title}</span>
                  </span>
                </Link>
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-12 justify-end py-2 whitespace-normal"
              >
                <Link
                  to="/grammar/$setId/$lessonId"
                  params={{ setId, lessonId: next.id }}
                >
                  <span className="flex min-w-0 flex-col items-end text-right">
                    <span className="text-xs text-muted-foreground">Next</span>
                    <span className="line-clamp-2">{next.title}</span>
                  </span>
                  <ChevronRightIcon />
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-12 justify-end py-2"
              >
                <Link to="/grammar/$setId" params={{ setId }}>
                  All lessons
                  <ChevronRightIcon />
                </Link>
              </Button>
            )}
          </nav>
        </>
      ) : (
        <LessonSkeleton />
      )}
    </article>
  );
}

function LessonSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-5/6" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

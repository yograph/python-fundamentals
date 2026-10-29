import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronLeftIcon,
  PartyPopperIcon,
  SquareCodeIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LabStepView, NextStepButton } from "@/features/labs/lab-step";
import { useExerciseSet, useManifest } from "@/lib/data/queries";
import { useLabProgress, useMarkStepPassed } from "@/lib/progress/lab-queries";
import { isStepPassed, readDraft } from "@/lib/progress/lab-store";
import { usePython } from "@/lib/python/python-runner";
import { cn } from "@/lib/utils";
import type { CodingLab } from "@/types/exercise";
import type { LabProgress } from "@/types/progress";

const routeApi = getRouteApi("/lab/$setId/$labId");

/**
 * The code a step opens with: for a carryOver step, the learner's own code
 * from the step before if they passed it (else that step's solution, so
 * skipping ahead still starts somewhere sensible); otherwise the starter.
 */
function openingCodeFor(
  setId: string,
  lab: CodingLab,
  index: number,
  progress: LabProgress | undefined,
): string {
  const step = lab.steps[index];
  if (step.carryOver && index > 0) {
    const previous = lab.steps[index - 1];
    if (isStepPassed(progress, lab.id, previous.id)) {
      const draft = readDraft(setId, lab.id, previous.id);
      if (draft !== null) return draft;
    }
    return previous.solution;
  }
  return step.starter ?? "";
}

/**
 * A coding lab: one program built up over a few steps, one step on screen at
 * a time. The step lives in the URL (`?step=2`), so a refresh or a shared
 * link lands on the same step; without one, the lab opens at the first step
 * not yet passed.
 */
export function LabPage() {
  const { setId, labId } = routeApi.useParams();
  const { step: stepParam } = routeApi.useSearch();
  const navigate = useNavigate();

  const manifest = useManifest();
  const set = useExerciseSet(setId);
  const progress = useLabProgress(setId);
  const markPassed = useMarkStepPassed(setId);
  const { preload } = usePython();

  // Start loading Python while the learner reads the first instructions.
  useEffect(() => preload(), [preload]);

  const summary = manifest.data?.exerciseSets?.find(
    (entry) => entry.id === setId,
  );
  const grammar = set.data?.kind === "grammar" ? set.data : null;
  const labIndex = grammar
    ? grammar.labs.findIndex((entry) => entry.id === labId)
    : -1;
  const lab = grammar && labIndex !== -1 ? grammar.labs[labIndex] : null;
  const lessonIndex =
    grammar && lab
      ? grammar.lessons.findIndex((entry) => entry.id === lab.lesson)
      : -1;
  const lesson =
    grammar && lessonIndex !== -1 ? grammar.lessons[lessonIndex] : null;
  const nextLab = grammar && lab ? (grammar.labs[labIndex + 1] ?? null) : null;
  const isMissing =
    (manifest.isSuccess && !summary) || (set.isSuccess && lab === null);
  const color = summary?.color ?? "#71717a";

  const hasBounced = useRef(false);
  useEffect(() => {
    if (hasBounced.current) return;
    if (!isMissing && !set.isError) return;
    hasBounced.current = true;
    toast.error(
      isMissing ? "That lab is not available" : "Could not load that lab",
      {
        description: isMissing
          ? "It may have been renamed or removed."
          : "Check your connection and try again.",
      },
    );
    void navigate({ to: "/", replace: true });
  }, [isMissing, set.isError, navigate]);

  const stepIndex = useMemo(() => {
    if (!lab) return 0;
    if (stepParam !== undefined && stepParam <= lab.steps.length) {
      return stepParam - 1;
    }
    const firstOpen = lab.steps.findIndex(
      (step) => !isStepPassed(progress.data, lab.id, step.id),
    );
    return firstOpen === -1 ? 0 : firstOpen;
  }, [lab, stepParam, progress.data]);

  // Pin the step in the URL, so passing it does not move the "first step not
  // yet passed" out from under the learner.
  useEffect(() => {
    if (!lab || stepParam === stepIndex + 1) return;
    void navigate({
      to: "/lab/$setId/$labId",
      params: { setId, labId },
      search: { step: stepIndex + 1 },
      replace: true,
    });
  }, [lab, stepParam, stepIndex, navigate, setId, labId]);

  const step = lab?.steps[stepIndex];
  const openingCode = useMemo(
    () => (lab ? openingCodeFor(setId, lab, stepIndex, progress.data) : ""),
    [setId, lab, stepIndex, progress.data],
  );

  const goToStep = (index: number) =>
    navigate({
      to: "/lab/$setId/$labId",
      params: { setId, labId },
      search: { step: index + 1 },
    });

  if (!lab || !step || !grammar) {
    return <LabSkeleton />;
  }

  const isLast = stepIndex === lab.steps.length - 1;
  const passedCount = lab.steps.filter((entry) =>
    isStepPassed(progress.data, lab.id, entry.id),
  ).length;

  return (
    <article
      className="flex flex-col gap-6"
      style={{ "--set-accent": color } as CSSProperties}
    >
      <div className="-ml-2 flex items-center gap-1">
        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          aria-label="Back to the lesson"
        >
          {lesson ? (
            <Link
              to="/grammar/$setId/$lessonId"
              params={{ setId, lessonId: lesson.id }}
            >
              <ChevronLeftIcon />
            </Link>
          ) : (
            <Link to="/grammar/$setId" params={{ setId }}>
              <ChevronLeftIcon />
            </Link>
          )}
        </Button>
        <span className="truncate text-sm text-muted-foreground">
          {lesson ? lesson.title : (summary?.name ?? "Lessons")}
        </span>
      </div>

      <header className="flex flex-col gap-2">
        <p
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
          style={{ color }}
        >
          <SquareCodeIcon className="size-3.5" aria-hidden="true" />
          Coding lab
          {lesson ? ` · Lesson ${lessonIndex + 1}` : null}
        </p>
        <h1 className="font-heading text-3xl leading-tight font-semibold tracking-tight">
          {lab.title}
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {lab.summary}
        </p>
      </header>

      <nav className="flex flex-col gap-2" aria-label="Steps">
        <ol className="flex flex-wrap gap-2">
          {lab.steps.map((entry, index) => {
            const passed = isStepPassed(progress.data, lab.id, entry.id);
            const current = index === stepIndex;
            return (
              <li key={entry.id}>
                <Link
                  to="/lab/$setId/$labId"
                  params={{ setId, labId }}
                  search={{ step: index + 1 }}
                  aria-label={`Step ${index + 1}: ${entry.title}${passed ? " (passed)" : ""}`}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    passed
                      ? "bg-[var(--set-accent)] text-white"
                      : "border-2 border-[var(--set-accent)]/40 text-muted-foreground",
                    current &&
                      "ring-2 ring-[var(--set-accent)] ring-offset-2 ring-offset-background",
                  )}
                >
                  {passed ? <CheckIcon className="size-4" /> : index + 1}
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-muted-foreground">
          Step {stepIndex + 1} of {lab.steps.length} ·{" "}
          <span className="tabular-nums">{passedCount}</span> passed
        </p>
      </nav>

      <LabStepView
        key={`${lab.id}:${step.id}`}
        setId={setId}
        labId={lab.id}
        step={step}
        initialCode={readDraft(setId, lab.id, step.id) ?? openingCode}
        openingCode={openingCode}
        passed={isStepPassed(progress.data, lab.id, step.id)}
        onPassed={() => markPassed.mutate({ labId: lab.id, stepId: step.id })}
        next={
          isLast ? (
            <LabComplete
              setId={setId}
              lessonId={lesson?.id}
              nextLab={nextLab}
            />
          ) : (
            <NextStepButton
              label={`Next: ${lab.steps[stepIndex + 1].title}`}
              onClick={() => void goToStep(stepIndex + 1)}
            />
          )
        }
      />
    </article>
  );
}

function LabComplete({
  setId,
  lessonId,
  nextLab,
}: {
  setId: string;
  lessonId: string | undefined;
  nextLab: CodingLab | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm">
        <PartyPopperIcon className="size-4 text-amber-500" aria-hidden="true" />
        That was the last step of this lab.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {lessonId ? (
          <Button asChild variant="outline" size="lg" className="h-11">
            <Link to="/grammar/$setId/$lessonId" params={{ setId, lessonId }}>
              <BookOpenIcon />
              Back to the lesson
            </Link>
          </Button>
        ) : null}
        {nextLab ? (
          <Button asChild size="lg" className="h-11">
            <Link to="/lab/$setId/$labId" params={{ setId, labId: nextLab.id }}>
              <SquareCodeIcon />
              <span className="truncate">Next lab: {nextLab.title}</span>
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LabSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-40" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>
      <Skeleton className="h-9 w-56 rounded-full" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

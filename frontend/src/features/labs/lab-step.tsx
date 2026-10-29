import {
  ArrowRightIcon,
  CheckIcon,
  CircleCheckIcon,
  LightbulbIcon,
  ListChecksIcon,
  LoaderCircleIcon,
  PlayIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";

import { CodeBlock } from "@/components/code-block";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { writeDraft } from "@/lib/progress/lab-store";
import type { RunResult, TestResult } from "@/lib/python/protocol";
import { type Outcome, usePython } from "@/lib/python/python-runner";
import { cn } from "@/lib/utils";
import type { LabStep } from "@/types/exercise";

import { CodeEditor } from "./code-editor";
import { LabModeBadge } from "./lab-mode";
import { describeError, errorHint } from "./python-errors";

interface LabStepViewProps {
  setId: string;
  labId: string;
  step: LabStep;
  /** The editor's content when the step opens: a saved draft, or the opening code. */
  initialCode: string;
  /** What "Start over" restores. */
  openingCode: string;
  passed: boolean;
  onPassed: () => void;
  /** Shown once the step has passed: the next step, or the lab's end. */
  next: ReactNode;
}

/**
 * One step of a lab: what to do, then an editor where the learner writes it,
 * runs it and checks it. Remounted per step (keyed by the route), so all of
 * this state is the step's own.
 */
export function LabStepView({
  setId,
  labId,
  step,
  initialCode,
  openingCode,
  passed,
  onPassed,
  next,
}: LabStepViewProps) {
  const python = usePython();
  const typedInputId = useId();
  const [code, setCode] = useState(initialCode);
  const [typed, setTyped] = useState((step.inputs ?? []).join("\n"));
  const [busy, setBusy] = useState<"run" | "check" | null>(null);
  const [ran, setRan] = useState<Outcome<RunResult> | null>(null);
  const [checked, setChecked] = useState<Outcome<TestResult[]> | null>(null);
  const [failedChecks, setFailedChecks] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  // Save as they type, so a refresh or a closed tab loses nothing.
  useEffect(() => {
    const timer = setTimeout(
      () => writeDraft(setId, labId, step.id, code),
      300,
    );
    return () => clearTimeout(timer);
  }, [setId, labId, step.id, code]);

  const typedLines = typed === "" ? [] : typed.split("\n");
  const hints = step.hints ?? [];
  const errorLine =
    (checked?.status === "done"
      ? checked.result.find((result) => result.error?.line)?.error?.line
      : undefined) ??
    (ran?.status === "done" ? ran.result.error?.line : undefined);

  const handleRun = async () => {
    if (busy) return;
    setBusy("run");
    setChecked(null);
    setRan(await python.run(code, typedLines));
    setBusy(null);
  };

  const handleCheck = async () => {
    if (busy) return;
    setBusy("check");
    setRan(null);
    // Tests always use the step's own typed input, not the edited box.
    const outcome = await python.test(code, step.tests, step.inputs ?? []);
    setChecked(outcome);
    setBusy(null);
    if (outcome.status === "done" && outcome.result.every((r) => r.passed)) {
      onPassed();
    } else {
      setFailedChecks((count) => count + 1);
    }
  };

  const handleStartOver = () => {
    if (
      code !== openingCode &&
      !window.confirm("Replace your code with the code this step started with?")
    ) {
      return;
    }
    setCode(openingCode);
    setRan(null);
    setChecked(null);
  };

  const allPassed =
    checked?.status === "done" && checked.result.every((r) => r.passed);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <LabModeBadge mode={step.mode} />
          {passed ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CircleCheckIcon className="size-3.5" aria-hidden="true" />
              Passed
            </span>
          ) : null}
        </div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          {step.title}
        </h2>
        <p className="leading-relaxed">
          <RichText text={step.instructions} />
        </p>
      </header>

      {step.guide ? (
        <section className="flex flex-col gap-3" aria-label="What to type">
          <p className="text-sm text-muted-foreground">
            Type it into the editor yourself, piece by piece, instead of copying
            it. Typing it is how your hands learn it.
          </p>
          <ol className="flex flex-col gap-3">
            {step.guide.map((piece, index) => (
              // Pieces are authored in order and never reordered.
              // biome-ignore lint/suspicious/noArrayIndexKey: position is identity
              <li key={index} className="flex gap-3">
                <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <CodeBlock
                    code={piece.code}
                    className="rounded-lg border bg-muted/50 py-2"
                  />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    <RichText text={piece.explain} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-label="Your code">
        <CodeEditor
          label="Your code"
          value={code}
          onChange={setCode}
          onRun={handleRun}
          errorLine={errorLine}
        />
        {step.inputs ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={typedInputId} className="text-sm font-medium">
              Typed input{" "}
              <span className="font-normal text-muted-foreground">
                (one line per input() call)
              </span>
            </label>
            <Textarea
              id={typedInputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              rows={Math.max(2, typedLines.length)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-mono text-base sm:text-sm"
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            disabled={busy !== null}
            onClick={handleRun}
          >
            {busy === "run" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <PlayIcon />
            )}
            Run
          </Button>
          <Button
            size="lg"
            className="h-11"
            disabled={busy !== null}
            onClick={handleCheck}
          >
            {busy === "check" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <ListChecksIcon />
            )}
            Check
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="h-11 text-muted-foreground"
            onClick={handleStartOver}
          >
            <RotateCcwIcon />
            Start over
          </Button>
        </div>
        <PythonStatusLine status={python.status} busy={busy} />
      </section>

      {ran ? <RunPanel outcome={ran} /> : null}
      {checked ? <CheckPanel outcome={checked} /> : null}

      {allPassed ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-600/40 bg-emerald-600/5 p-4">
          <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CircleCheckIcon className="size-5" aria-hidden="true" />
            Every check passes. Nicely done.
          </p>
          {next}
        </div>
      ) : passed ? (
        <div className="flex flex-col gap-3">{next}</div>
      ) : null}

      {hints.length > 0 || failedChecks > 0 || passed ? (
        <section className="flex flex-col gap-3" aria-label="Help">
          {hints.slice(0, hintsShown).map((hint, index) => (
            <div
              // Hints are authored in order and revealed in order.
              // biome-ignore lint/suspicious/noArrayIndexKey: position is identity
              key={index}
              className="flex gap-3 rounded-xl border bg-muted/50 px-4 py-3"
            >
              <LightbulbIcon
                className="mt-0.5 size-4 shrink-0 text-amber-500"
                aria-label={`Hint ${index + 1}`}
              />
              <p className="text-sm leading-relaxed">
                <RichText text={hint} />
              </p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {hintsShown < hints.length ? (
              <Button
                variant="outline"
                onClick={() => setHintsShown((count) => count + 1)}
              >
                <LightbulbIcon />
                {hintsShown === 0 ? "Show a hint" : "Show another hint"}
              </Button>
            ) : null}
            {(failedChecks > 0 || passed) && !showSolution ? (
              <Button variant="ghost" onClick={() => setShowSolution(true)}>
                Show a solution
              </Button>
            ) : null}
          </div>
          {showSolution ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">
                One way to write it. Yours can differ and still pass. If you use
                it, type it rather than paste it.
              </p>
              <CodeBlock
                code={step.solution}
                aria-label="Solution"
                className="rounded-xl border bg-muted/50"
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PythonStatusLine({
  status,
  busy,
}: {
  status: string;
  busy: "run" | "check" | null;
}) {
  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">
        Starting Python in your browser. The first time takes a few seconds.
      </p>
    );
  }
  if (status === "failed" && !busy) {
    return (
      <p className="text-sm text-destructive">
        Python could not start. Check your connection, then press Run again.
      </p>
    );
  }
  return (
    <p className="hidden text-xs text-muted-foreground sm:block">
      Ctrl+Enter (or Cmd+Enter) runs your code.
    </p>
  );
}

function OutcomeProblem({ outcome }: { outcome: Outcome<unknown> }) {
  if (outcome.status === "timeout") {
    return (
      <p className="text-sm text-destructive">
        Your program was still running after {outcome.seconds} seconds, so it
        was stopped. Is there a loop that never stops (a missing update like i
        += 1?) or a recursion without a base case?
      </p>
    );
  }
  if (outcome.status === "failed") {
    return (
      <p className="text-sm text-destructive">
        Python could not run this: {outcome.message}
      </p>
    );
  }
  return null;
}

/** A runaway loop can print tens of thousands of lines; show the start. */
const MAX_SHOWN_LINES = 200;

function RunPanel({ outcome }: { outcome: Outcome<RunResult> }) {
  const lines =
    outcome.status === "done" ? outcome.result.output.split("\n") : [];
  const hidden = Math.max(0, lines.length - MAX_SHOWN_LINES);
  return (
    <section
      className="overflow-hidden rounded-xl border"
      aria-label="Output"
      aria-live="polite"
    >
      <p className="border-b bg-muted/50 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Output
      </p>
      {outcome.status === "done" ? (
        <>
          {outcome.result.output ? (
            <>
              <CodeBlock
                code={
                  hidden > 0
                    ? lines.slice(0, MAX_SHOWN_LINES).join("\n")
                    : outcome.result.output
                }
                className="max-h-96 overflow-y-auto"
              />
              {hidden > 0 ? (
                <p className="px-4 pb-3 text-sm text-muted-foreground">
                  …and {hidden.toLocaleString()} more lines.
                </p>
              ) : null}
            </>
          ) : !outcome.result.error ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              The program ran and printed nothing.
            </p>
          ) : null}
          {outcome.result.error ? (
            <ErrorBox error={outcome.result.error} />
          ) : null}
        </>
      ) : (
        <div className="px-4 py-3">
          <OutcomeProblem outcome={outcome} />
        </div>
      )}
    </section>
  );
}

function ErrorBox({ error }: { error: NonNullable<RunResult["error"]> }) {
  const hint = errorHint(error);
  return (
    <div className="flex flex-col gap-1 border-t border-destructive/30 bg-destructive/5 px-4 py-3">
      <p className="font-mono text-sm break-words text-destructive">
        {describeError(error)}
      </p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CheckPanel({ outcome }: { outcome: Outcome<TestResult[]> }) {
  if (outcome.status !== "done") {
    return (
      <section className="rounded-xl border px-4 py-3" aria-live="polite">
        <OutcomeProblem outcome={outcome} />
      </section>
    );
  }
  const passedCount = outcome.result.filter((r) => r.passed).length;
  return (
    <section
      className="flex flex-col gap-2 rounded-xl border px-4 py-3"
      aria-label="Checks"
      aria-live="polite"
    >
      <p className="text-sm font-medium">
        {passedCount} of {outcome.result.length} checks pass
      </p>
      <ul className="flex flex-col gap-2">
        {outcome.result.map((result, index) => (
          <li
            // Results come back in the tests' authored order.
            // biome-ignore lint/suspicious/noArrayIndexKey: position is identity
            key={index}
            className="flex gap-2 text-sm"
          >
            {result.passed ? (
              <CheckIcon
                className="mt-0.5 size-4 shrink-0 text-emerald-600"
                aria-label="Passed"
              />
            ) : (
              <XIcon
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-label="Failed"
              />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={cn(!result.passed && "font-medium")}>
                {result.name}
              </span>
              {!result.passed && result.message ? (
                <span className="text-muted-foreground">{result.message}</span>
              ) : null}
              {!result.passed && result.error ? (
                <span className="font-mono text-xs break-words text-destructive">
                  {describeError(result.error)}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Small footer button used by the lab page for "Next step". */
export function NextStepButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button size="lg" className="h-11 w-full" onClick={onClick}>
      {label}
      <ArrowRightIcon />
    </Button>
  );
}

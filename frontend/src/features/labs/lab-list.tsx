import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronRightIcon, SquareCodeIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { useLabProgress } from "@/lib/progress/lab-queries";
import { countPassedSteps, isStepPassed } from "@/lib/progress/lab-store";
import { cn } from "@/lib/utils";
import type { CodingLab } from "@/types/exercise";

interface LabListProps {
  setId: string;
  color: string;
  labs: CodingLab[];
  /** Shown under each lab's title, e.g. which lesson it belongs to. */
  caption?: (lab: CodingLab) => string | undefined;
}

/**
 * Coding labs as rows, styled like the lesson list: an icon that becomes a
 * check once every step has passed, the title and summary, and how many steps
 * are done.
 */
export function LabList({ setId, color, labs, caption }: LabListProps) {
  const progress = useLabProgress(setId);

  return (
    <ul
      className="flex flex-col divide-y overflow-hidden rounded-xl border"
      style={{ "--set-accent": color } as CSSProperties}
    >
      {labs.map((lab) => {
        const passed = countPassedSteps(lab, progress.data);
        const done = passed === lab.steps.length;
        const label = caption?.(lab);

        return (
          <li key={lab.id}>
            <Link
              to="/lab/$setId/$labId"
              params={{ setId, labId: lab.id }}
              className="flex items-center gap-3 px-3 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/60 active:bg-muted"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  done
                    ? "bg-[var(--set-accent)] text-white"
                    : "border-2 border-[var(--set-accent)] text-[var(--set-accent)]",
                )}
              >
                {done ? (
                  <CheckIcon className="size-4" aria-label="Done" />
                ) : (
                  <SquareCodeIcon className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {label ? (
                  <span className="text-xs text-muted-foreground">{label}</span>
                ) : null}
                <span className="leading-snug font-medium">{lab.title}</span>
                <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                  {lab.summary}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {lab.steps.map((step) => (
                    <span
                      key={step.id}
                      className={cn(
                        "h-1.5 w-4 rounded-full",
                        isStepPassed(progress.data, lab.id, step.id)
                          ? "bg-[var(--set-accent)]"
                          : "bg-muted",
                      )}
                    />
                  ))}
                  <span className="ml-1 tabular-nums">
                    {passed}/{lab.steps.length} steps
                  </span>
                </span>
              </span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

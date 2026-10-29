import { z } from "zod";
import type { CodingLab } from "@/types/exercise";
import type { LabProgress } from "@/types/progress";
import { safeGet, safeSet } from "./storage";

/**
 * Coding-lab progress and the learner's code, both local-only. Same hard rule
 * as the other stores: **reads never throw**.
 *
 * Progress is one entry per set, like practice progress. Each step's code is
 * its own entry, so typing in one step rewrites a few hundred bytes rather
 * than every lab's code at once.
 */

const PROGRESS_PREFIX = "python-fundamentals:labs:v1:";
const DRAFT_PREFIX = "python-fundamentals:lab-code:v1:";

const progressKey = (setId: string) => `${PROGRESS_PREFIX}${setId}`;
const draftKey = (setId: string, labId: string, stepId: string) =>
  `${DRAFT_PREFIX}${setId}:${labId}:${stepId}`;

/** How a step is addressed inside `LabProgress.steps`. */
export const stepKey = (labId: string, stepId: string) => `${labId}/${stepId}`;

const labProgressSchema = z.object({
  setId: z.string().min(1),
  updatedAt: z.string(),
  steps: z.record(z.string(), z.object({ passedAt: z.string() })),
});

function emptyProgress(setId: string): LabProgress {
  return { setId, updatedAt: new Date(0).toISOString(), steps: {} };
}

/** Progress for a set, or empty progress. Never throws. */
export function readLabProgress(setId: string): LabProgress {
  const raw = safeGet(progressKey(setId));
  if (raw === null) return emptyProgress(setId);
  try {
    const result = labProgressSchema.safeParse(JSON.parse(raw));
    return result.success ? { ...result.data, setId } : emptyProgress(setId);
  } catch {
    return emptyProgress(setId);
  }
}

export function writeLabProgress(progress: LabProgress): void {
  safeSet(progressKey(progress.setId), JSON.stringify(progress));
}

/** Pure: the progress with one more step passed. */
export function withStepPassed(
  progress: LabProgress,
  labId: string,
  stepId: string,
): LabProgress {
  const now = new Date().toISOString();
  return {
    ...progress,
    updatedAt: now,
    steps: { ...progress.steps, [stepKey(labId, stepId)]: { passedAt: now } },
  };
}

export function isStepPassed(
  progress: LabProgress | undefined,
  labId: string,
  stepId: string,
): boolean {
  return Boolean(progress?.steps[stepKey(labId, stepId)]);
}

export function countPassedSteps(
  lab: CodingLab,
  progress: LabProgress | undefined,
): number {
  return lab.steps.filter((step) => isStepPassed(progress, lab.id, step.id))
    .length;
}

/** The learner's saved code for a step, or null if they never typed any. */
export function readDraft(
  setId: string,
  labId: string,
  stepId: string,
): string | null {
  return safeGet(draftKey(setId, labId, stepId));
}

export function writeDraft(
  setId: string,
  labId: string,
  stepId: string,
  code: string,
): void {
  safeSet(draftKey(setId, labId, stepId), code);
}

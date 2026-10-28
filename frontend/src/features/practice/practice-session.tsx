import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Progress } from "@/components/ui/progress";
import {
  useRateExercise,
  useResetPracticeProgress,
} from "@/lib/progress/practice-queries";
import type { ExerciseSet } from "@/types/exercise";
import type { PracticeProgress } from "@/types/progress";

import { GrammarRunner } from "./grammar-runner";
import { PracticeComplete } from "./practice-complete";
import { TranslationRunner } from "./translation-runner";
import { WritingRunner } from "./writing-runner";

interface PracticeSessionProps {
  set: ExerciseSet;
  progress: PracticeProgress;
  /** Replaces the end screen's "Back to overview"; see `PracticeComplete`. */
  backAction?: ReactNode;
  /**
   * True when `set` is a narrowed view of a larger set (one lesson's
   * exercises): "Reset progress" then clears only the exercises in view.
   */
  isPartial?: boolean;
}

/**
 * Session boundary, the practice mirror of `StudySession`: bumping `sessionId`
 * remounts the runner, which is what "practice again" means — a fresh queue
 * ordered from the progress as it stands then.
 */
export function PracticeSession({
  set,
  progress,
  backAction,
  isPartial = false,
}: PracticeSessionProps) {
  const [sessionId, setSessionId] = useState(0);
  const resetProgress = useResetPracticeProgress(
    set.id,
    isPartial ? set.exercises.map((exercise) => exercise.id) : undefined,
  );

  const startNewSession = () => setSessionId((id) => id + 1);

  const handleResetProgress = () => {
    resetProgress.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Progress for ${set.name} was reset`);
        startNewSession();
      },
      onError: (error) =>
        toast.error("Could not reset progress", {
          description: error.message,
        }),
    });
  };

  return (
    <PracticeRunner
      key={sessionId}
      set={set}
      progress={progress}
      isResetting={resetProgress.isPending}
      onPracticeAgain={startNewSession}
      onResetProgress={handleResetProgress}
      backAction={backAction}
    />
  );
}

/**
 * The exercises not yet answered correctly, in authored order, then the rest —
 * so a round always starts with what still needs work. Returns indices into
 * `set.exercises` rather than items, so the runner can keep the set's
 * discriminated union intact (narrowing `set.kind` narrows the item type).
 */
function orderQueue(set: ExerciseSet, progress: PracticeProgress): number[] {
  const pending: number[] = [];
  const done: number[] = [];
  set.exercises.forEach((exercise, index) => {
    (progress.exercises[exercise.id]?.correct ? done : pending).push(index);
  });
  return [...pending, ...done];
}

interface PracticeRunnerProps {
  set: ExerciseSet;
  progress: PracticeProgress;
  backAction: ReactNode;
  isResetting: boolean;
  onPracticeAgain: () => void;
  onResetProgress: () => void;
}

function PracticeRunner({
  set,
  progress,
  backAction,
  isResetting,
  onPracticeAgain,
  onResetProgress,
}: PracticeRunnerProps) {
  // Captured once at mount: the queue must not reorder mid-round as verdicts
  // land, and this component is remounted per session by its parent.
  const [queue] = useState(() => orderQueue(set, progress));
  const [position, setPosition] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  const rate = useRateExercise(set.id);

  if (position >= queue.length) {
    return (
      <PracticeComplete
        correct={sessionCorrect}
        total={queue.length}
        isResetting={isResetting}
        onPracticeAgain={onPracticeAgain}
        onResetProgress={onResetProgress}
        backAction={backAction}
      />
    );
  }

  const index = queue[position];
  const isLast = position === queue.length - 1;
  const advance = () => setPosition((at) => at + 1);

  const record = (exerciseId: string) => (correct: boolean) => {
    if (correct) setSessionCorrect((count) => count + 1);
    rate.mutate(
      { exerciseId, correct },
      {
        onError: (error) =>
          toast.error("Could not save your progress", {
            description: error.message,
          }),
      },
    );
  };

  /** Self-rated kinds save and advance in one tap. */
  const recordAndAdvance = (exerciseId: string) => (correct: boolean) => {
    record(exerciseId)(correct);
    advance();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {position + 1} of {queue.length}
          </span>
          <span className="tabular-nums">{sessionCorrect} correct</span>
        </div>
        <Progress value={(position / queue.length) * 100} />
      </div>

      {set.kind === "grammar" ? (
        <GrammarRunner
          key={set.exercises[index].id}
          exercise={set.exercises[index]}
          isLast={isLast}
          onAnswer={record(set.exercises[index].id)}
          onNext={advance}
        />
      ) : set.kind === "translation" ? (
        <TranslationRunner
          key={set.exercises[index].id}
          exercise={set.exercises[index]}
          onAnswer={recordAndAdvance(set.exercises[index].id)}
        />
      ) : (
        <WritingRunner
          key={set.exercises[index].id}
          exercise={set.exercises[index]}
          onAnswer={recordAndAdvance(set.exercises[index].id)}
        />
      )}
    </div>
  );
}

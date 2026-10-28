import { Link } from "@tanstack/react-router";
import { HomeIcon, RotateCcwIcon, TrashIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/features/study/score-ring";

interface PracticeCompleteProps {
  /** This round's score, not the all-time one — the round just ended. */
  correct: number;
  total: number;
  isResetting: boolean;
  onPracticeAgain: () => void;
  onResetProgress: () => void;
  /**
   * Where "back" goes when the round was started from somewhere other than
   * the overview (a lesson, a course level). A rendered button, so this
   * component stays free of route knowledge.
   */
  backAction?: ReactNode;
}

export function PracticeComplete({
  correct,
  total,
  isResetting,
  onPracticeAgain,
  onResetProgress,
  backAction,
}: PracticeCompleteProps) {
  const perfect = total > 0 && correct >= total;

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <ScoreRing
        known={correct}
        total={total}
        sublabel="this round"
        ariaLabel={`${correct} of ${total} exercises correct this round`}
      />
      <p className="text-center text-sm text-muted-foreground">
        {perfect
          ? "Every exercise in this round was correct."
          : "The ones you missed come first next round."}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button size="lg" className="h-11 text-base" onClick={onPracticeAgain}>
          <RotateCcwIcon />
          Practice again
        </Button>
        {backAction ?? (
          <Button asChild variant="outline" size="lg" className="h-11">
            <Link to="/">
              <HomeIcon />
              Back to overview
            </Link>
          </Button>
        )}
        <Button
          variant="destructive"
          size="lg"
          className="h-11"
          disabled={isResetting}
          onClick={onResetProgress}
        >
          <TrashIcon />
          Reset progress
        </Button>
      </div>
    </div>
  );
}

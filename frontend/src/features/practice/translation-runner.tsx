import { EyeIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TranslationExercise } from "@/types/exercise";

import { SelfRating } from "./self-rating";

interface TranslationRunnerProps {
  exercise: TranslationExercise;
  /** Called when the learner rates their own attempt; rating advances. */
  onAnswer: (correct: boolean) => void;
}

/**
 * One translation: write an attempt, reveal the reference, judge yourself.
 * There is no string comparison on purpose — most sentences have several
 * correct translations, and a diff against one of them would mark honest
 * variants wrong. Remounted per exercise, so all state is local.
 */
export function TranslationRunner({
  exercise,
  onAnswer,
}: TranslationRunnerProps) {
  const [attempt, setAttempt] = useState("");
  const [revealed, setRevealed] = useState(false);

  const fromLabel = exercise.direction === "nl-en" ? "Dutch" : "English";
  const toLabel = exercise.direction === "nl-en" ? "English" : "Dutch";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {fromLabel} → {toLabel}
        </p>
        <p className="text-lg leading-relaxed font-medium">{exercise.source}</p>
      </div>

      <Textarea
        value={attempt}
        onChange={(event) => setAttempt(event.target.value)}
        placeholder={`Your ${toLabel} translation…`}
        aria-label={`Your ${toLabel} translation`}
        readOnly={revealed}
        // Language tools' autocorrect would do the exercise for the learner.
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {revealed ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Reference translation
            </p>
            <p className="mt-1 text-base">{exercise.reference}</p>
          </div>
          <SelfRating onRate={onAnswer} />
        </div>
      ) : (
        <Button
          size="lg"
          className="h-11 w-full"
          onClick={() => setRevealed(true)}
        >
          <EyeIcon />
          Show translation
        </Button>
      )}
    </div>
  );
}

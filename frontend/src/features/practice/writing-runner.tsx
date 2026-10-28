import { EyeIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { WritingExercise } from "@/types/exercise";

import { SelfRating } from "./self-rating";

interface WritingRunnerProps {
  exercise: WritingExercise;
  /** Called when the learner rates their own attempt; rating advances. */
  onAnswer: (correct: boolean) => void;
}

/**
 * One writing prompt: write, reveal a model answer, judge yourself. The model
 * answer is one good way to do it, not the answer — which is why the verdict
 * is the learner's own.
 */
export function WritingRunner({ exercise, onAnswer }: WritingRunnerProps) {
  const [attempt, setAttempt] = useState("");
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-lg leading-relaxed font-medium">{exercise.prompt}</p>
        <p className="text-sm text-muted-foreground">{exercise.instructions}</p>
      </div>

      <Textarea
        value={attempt}
        onChange={(event) => setAttempt(event.target.value)}
        placeholder="Schrijf hier je tekst…"
        aria-label="Your Dutch text"
        className="min-h-40"
        readOnly={revealed}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {revealed ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Example answer
            </p>
            {/* The example uses newlines between sentences by contract. */}
            <p className="mt-1 text-base whitespace-pre-line">
              {exercise.example}
            </p>
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
          Show example answer
        </Button>
      )}
    </div>
  );
}

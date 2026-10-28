import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";

import { CodeBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GrammarExercise } from "@/types/exercise";

interface GrammarRunnerProps {
  exercise: GrammarExercise;
  isLast: boolean;
  /** Called once, at the moment a choice is picked — that is when progress is saved. */
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}

/**
 * One multiple-choice question. Picking a choice grades it immediately and
 * reveals the explanation; "Next" is a separate step so the learner actually
 * sees why. Remounted per exercise (keyed by id), so all state is local.
 */
export function GrammarRunner({
  exercise,
  isLast,
  onAnswer,
  onNext,
}: GrammarRunnerProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  const choose = (index: number) => {
    if (answered) return;
    setSelected(index);
    onAnswer(index === exercise.answerIndex);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg leading-relaxed font-medium">{exercise.prompt}</p>

      {exercise.code ? (
        <CodeBlock
          code={exercise.code}
          aria-label="Code"
          className="rounded-xl border bg-muted/50"
        />
      ) : null}

      <fieldset className="flex flex-col gap-2" aria-label="Choices">
        {exercise.choices.map((choice, index) => {
          const isAnswer = index === exercise.answerIndex;
          const isSelected = index === selected;
          return (
            <Button
              // The contract forbids duplicate choices, so the text is a key.
              key={choice}
              variant="outline"
              size="lg"
              disabled={answered && !isAnswer && !isSelected}
              onClick={() => choose(index)}
              className={cn(
                "h-auto min-h-11 justify-start px-4 py-2.5 text-left text-base whitespace-normal",
                // Output and code keep their line breaks and indentation.
                exercise.codeChoices &&
                  "font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap sm:text-sm",
                answered &&
                  isAnswer &&
                  "border-emerald-600/60 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-700 disabled:opacity-100 dark:text-emerald-400 dark:hover:text-emerald-400",
                answered &&
                  isSelected &&
                  !isAnswer &&
                  "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              {choice}
            </Button>
          );
        })}
      </fieldset>

      {answered ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
            <p>
              <span
                className={cn(
                  "font-medium",
                  selected === exercise.answerIndex
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                {selected === exercise.answerIndex
                  ? "Correct. "
                  : "Not quite. "}
              </span>
              {exercise.explanation}
            </p>
          </div>
          <Button size="lg" className="h-11 w-full" onClick={onNext}>
            {isLast ? "Finish" : "Next"}
            <ArrowRightIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

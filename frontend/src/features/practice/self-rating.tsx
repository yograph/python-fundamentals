import { CheckIcon, XIcon } from "lucide-react";

import { RatingButtons } from "@/features/study/rating-buttons";

interface SelfRatingProps {
  onRate: (correct: boolean) => void;
  disabled?: boolean;
}

/**
 * The self-check verdict for translation and writing exercises, where the
 * learner compares their own attempt against the reference. The practice
 * wording on the shared verdict buttons; rating advances to the next
 * exercise, like the study session's rating does.
 */
export function SelfRating({ onRate, disabled }: SelfRatingProps) {
  return (
    <RatingButtons
      onRate={onRate}
      disabled={disabled}
      negative={{ icon: XIcon, label: "Not quite" }}
      positive={{ icon: CheckIcon, label: "I had it right" }}
    />
  );
}

import { CornerUpLeftIcon, CornerUpRightIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Button } from "@/components/ui/button";

interface VerdictOption {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
}

interface RatingButtonsProps {
  onRate: (known: boolean) => void;
  disabled?: boolean;
  /** Left/negative verdict. Defaults to the study session's wording. */
  negative?: VerdictOption;
  /** Right/positive verdict. Defaults to the study session's wording. */
  positive?: VerdictOption;
}

const STUDY_NEGATIVE: VerdictOption = {
  icon: CornerUpLeftIcon,
  label: "Incorrect",
};
const STUDY_POSITIVE: VerdictOption = {
  icon: CornerUpRightIcon,
  label: "Correct",
};

/**
 * The two big verdict buttons, shared by the study session and the practice
 * self-check (which passes its own icons and labels). The default wording
 * mirrors the keyboard shortcuts the study session installs: ArrowLeft is
 * incorrect, ArrowRight is correct — that coupling belongs to the study
 * session, not to this component.
 */
export function RatingButtons({
  onRate,
  disabled,
  negative = STUDY_NEGATIVE,
  positive = STUDY_POSITIVE,
}: RatingButtonsProps) {
  return (
    <div className="mx-auto flex w-full max-w-sm items-stretch gap-3">
      <Button
        variant="ghost"
        size="lg"
        disabled={disabled}
        onClick={() => onRate(false)}
        className="h-auto flex-1 flex-col gap-1 py-4 text-muted-foreground"
      >
        <negative.icon className="size-6" />
        <span className="text-sm">{negative.label}</span>
      </Button>
      <Button
        variant="ghost"
        size="lg"
        disabled={disabled}
        onClick={() => onRate(true)}
        className="h-auto flex-1 flex-col gap-1 py-4 text-muted-foreground"
      >
        <positive.icon className="size-6" />
        <span className="text-sm">{positive.label}</span>
      </Button>
    </div>
  );
}

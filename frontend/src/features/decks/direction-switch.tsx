import { ArrowRightIcon } from "lucide-react";
import { useId } from "react";

import { Switch } from "@/components/ui/switch";
import { directionEndpoints, flipDirection } from "@/features/study/directions";
import type { DeckLanguages } from "@/types/deck";
import type { StudyDirection } from "@/types/session";

interface DirectionSwitchProps {
  languages: DeckLanguages;
  direction: StudyDirection;
  onChange: (direction: StudyDirection) => void;
}

/**
 * Which language is asked and which is answered - one switch, two states.
 *
 * This replaced a three-option toggle group (front, back, both). Direction is
 * binary now, and a binary choice deserves a switch: flipping it rewrites the
 * label so the arrow reads from the new prompt language to the new answer
 * language, and the word list underneath swaps its two columns to match. The
 * label and the list therefore always agree about what is being asked, which is
 * the whole point of showing the pair on this page.
 */
export function DirectionSwitch({
  languages,
  direction,
  onChange,
}: DirectionSwitchProps) {
  const id = useId();
  const { from, to } = directionEndpoints(languages, direction);

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
      {/* A real <label>, so the whole line is the tap target and not just the
          32px switch. `button` is labelable, which is what Switch renders. */}
      <label
        htmlFor={id}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-base font-medium select-none"
      >
        <span className="truncate">{from}</span>
        <ArrowRightIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="truncate">{to}</span>
      </label>
      <Switch
        id={id}
        checked={direction === "back-to-front"}
        onCheckedChange={() => onChange(flipDirection(direction))}
        aria-label={`Study direction: ${from} to ${to}. Switch to swap.`}
      />
    </div>
  );
}

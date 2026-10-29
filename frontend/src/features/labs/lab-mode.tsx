import {
  FlaskConicalIcon,
  FootprintsIcon,
  type LucideIcon,
  PencilIcon,
  SquareCodeIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { LabMode } from "@/types/exercise";

/** How each mode presents itself: the fading from full guidance to none. */
export const LAB_MODES: Record<
  LabMode,
  { label: string; icon: LucideIcon; className: string }
> = {
  guided: {
    label: "Follow along",
    icon: FootprintsIcon,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  change: {
    label: "Change it",
    icon: PencilIcon,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  write: {
    label: "On your own",
    icon: SquareCodeIcon,
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  challenge: {
    label: "Experiment",
    icon: FlaskConicalIcon,
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

export function LabModeBadge({ mode }: { mode: LabMode }) {
  const { label, icon: Icon, className } = LAB_MODES[mode];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

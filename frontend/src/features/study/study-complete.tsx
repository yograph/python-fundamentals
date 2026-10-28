import { Link } from "@tanstack/react-router";
import { HomeIcon, RotateCcwIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ScoreRing } from "./score-ring";

interface StudyCompleteProps {
  known: number;
  total: number;
  isResetting: boolean;
  onStudyAgain: () => void;
  onResetProgress: () => void;
}

export function StudyComplete({
  known,
  total,
  isResetting,
  onStudyAgain,
  onResetProgress,
}: StudyCompleteProps) {
  const perfect = total > 0 && known >= total;

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <ScoreRing known={known} total={total} />
      <p className="text-center text-sm text-muted-foreground">
        {perfect
          ? "Every word in this selection is marked known."
          : "Nothing left to review in this selection."}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button size="lg" className="h-11 text-base" onClick={onStudyAgain}>
          <RotateCcwIcon />
          Study again
        </Button>
        <Button asChild variant="outline" size="lg" className="h-11">
          <Link to="/">
            <HomeIcon />
            Back to decks
          </Link>
        </Button>
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

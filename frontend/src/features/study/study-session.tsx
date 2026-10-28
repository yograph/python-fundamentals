import { useState } from "react";
import { toast } from "sonner";

import { useResetDeckProgress } from "@/lib/progress/queries";
import type { Deck } from "@/types/deck";
import type { DeckProgress } from "@/types/progress";
import type { StudyDirection } from "@/types/session";

import { StudyRunner } from "./study-runner";

interface StudySessionProps {
  deck: Deck;
  progress: DeckProgress;
  /** `null` means every word in the deck, tagged or not. */
  tags: string[] | null;
  direction: StudyDirection;
}

/**
 * Session boundary. Bumping `sessionId` remounts the runner, which is what
 * "study again" means: a fresh shuffle and an empty answered set.
 */
export function StudySession({
  deck,
  progress,
  tags,
  direction,
}: StudySessionProps) {
  const [sessionId, setSessionId] = useState(0);
  const resetProgress = useResetDeckProgress(deck.id);

  const startNewSession = () => setSessionId((id) => id + 1);

  const handleResetProgress = () => {
    resetProgress.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Progress for ${deck.name} was reset`);
        startNewSession();
      },
      onError: (error) =>
        toast.error("Could not reset progress", {
          description: error.message,
        }),
    });
  };

  return (
    <StudyRunner
      key={sessionId}
      deck={deck}
      progress={progress}
      tags={tags}
      direction={direction}
      isResetting={resetProgress.isPending}
      onStudyAgain={startNewSession}
      onResetProgress={handleResetProgress}
    />
  );
}

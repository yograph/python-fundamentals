import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Progress } from "@/components/ui/progress";
import { useSpeakOnFlip } from "@/lib/audio/speak-on-flip";
import { useSpeak } from "@/lib/audio/use-speech";
import { useRateWord } from "@/lib/progress/queries";
import { shuffle } from "@/lib/utils";
import type { Deck } from "@/types/deck";
import type { DeckProgress } from "@/types/progress";
import type { StudyDirection } from "@/types/session";

import { CardStack } from "./card-stack";
import { RatingButtons } from "./rating-buttons";
import { buildStudyCards, selectWords } from "./session-queue";
import { SpeakToggle } from "./speak-toggle";
import { StudyComplete } from "./study-complete";

interface StudyRunnerProps {
  deck: Deck;
  progress: DeckProgress;
  tags: string[] | null;
  direction: StudyDirection;
  isResetting: boolean;
  onStudyAgain: () => void;
  onResetProgress: () => void;
}

/**
 * One pass through a selection. The queue is derived from props, never copied
 * into state: `cards` is the shuffled selection (stable for the lifetime of the
 * component, which the parent remounts to start a new session) and `remaining`
 * filters it by what has been answered here and what progress already knows. A
 * rating therefore removes one card and cannot reshuffle the rest under the
 * learner's finger.
 *
 * Every verdict - swipe, button or arrow key - goes through `handleRate`, so
 * there is one place that decides what a rating does and one direction the card
 * flies.
 */
export function StudyRunner({
  deck,
  progress,
  tags,
  direction,
  isResetting,
  onStudyAgain,
  onResetProgress,
}: StudyRunnerProps) {
  const { mutate: rateWord } = useRateWord(deck.id);
  const { speak, isPlaying } = useSpeak();
  const { speakOnFlip, setSpeakOnFlip } = useSpeakOnFlip();

  const [answered, setAnswered] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [flippedKey, setFlippedKey] = useState<string | null>(null);
  /** Which way the card that is leaving should fly. 1 is right, -1 is left. */
  const [exitDirection, setExitDirection] = useState<1 | -1>(1);

  const cards = useMemo(
    () => shuffle(buildStudyCards(deck, tags, direction)),
    [deck, tags, direction],
  );

  const remaining = useMemo(
    () =>
      cards.filter(
        (card) =>
          !answered.has(card.wordId) && !progress.words[card.wordId]?.known,
      ),
    [cards, answered, progress],
  );

  const selection = useMemo(() => selectWords(deck, tags), [deck, tags]);
  const knownInSelection = selection.filter(
    (word) => progress.words[word.id]?.known,
  ).length;

  const current = remaining[0];

  const speakAnswer = useCallback(() => {
    if (!current) return;
    // `useSpeak` strips the inline formatting itself, and the locale comes from
    // the card, which was oriented by the session's direction - so the answer is
    // always read in its own language.
    speak(current.answer, current.answerLanguage.locale);
  }, [current, speak]);

  const handleRate = useCallback(
    (known: boolean) => {
      if (!current) return;

      // Set before the queue changes: the card is gone in the same render, and
      // the exit animation reads this to know which way to throw it.
      setExitDirection(known ? 1 : -1);
      setAnswered((previous) => new Set(previous).add(current.wordId));
      rateWord(
        { wordId: current.wordId, known },
        {
          onError: () => toast.error("Could not save that answer"),
        },
      );
    },
    [current, rateWord],
  );

  const isFlipped = current !== undefined && flippedKey === current.wordId;

  const toggleFlip = useCallback(() => {
    if (!current) return;

    const showAnswer = flippedKey !== current.wordId;
    setFlippedKey(showAnswer ? current.wordId : null);
    // Spoken here rather than in an effect: turning the card over is the event,
    // and an effect on the flipped state would fire again on every unrelated
    // re-render of the same card.
    if (showAnswer && speakOnFlip) speakAnswer();
  }, [current, flippedKey, speakOnFlip, speakAnswer]);

  const handleSpeakOnFlipChange = useCallback(
    (enabled: boolean) => {
      setSpeakOnFlip(enabled);
      // Turning it on while an answer is showing says that answer now, so the
      // tap has a result instead of only arming a later one.
      if (enabled && isFlipped) speakAnswer();
    },
    [isFlipped, setSpeakOnFlip, speakAnswer],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const { target } = event;

      switch (event.key) {
        case "ArrowLeft":
        case "ArrowRight":
          // The card face is itself a button, so it counts as a focused
          // control - but the verdict keys have to keep working while it holds
          // focus, or tabbing to the card takes the keyboard path away.
          if (isInteractiveTarget(target) && !isCardFace(target)) return;
          event.preventDefault();
          handleRate(event.key === "ArrowRight");
          break;
        case " ":
        case "Enter":
          // Left to the focused control: the face button already flips on both.
          if (isInteractiveTarget(target)) return;
          event.preventDefault();
          toggleFlip();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRate, toggleFlip]);

  if (!current) {
    return (
      <StudyComplete
        known={knownInSelection}
        total={selection.length}
        isResetting={isResetting}
        onStudyAgain={onStudyAgain}
        onResetProgress={onResetProgress}
      />
    );
  }

  const reviewed = cards.length - remaining.length;
  const percent =
    cards.length > 0 ? Math.round((reviewed / cards.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {remaining.length} {remaining.length === 1 ? "card" : "cards"} left
          </span>
          <div className="flex items-center gap-1">
            <SpeakToggle
              enabled={speakOnFlip}
              isSpeaking={isPlaying}
              onChange={handleSpeakOnFlipChange}
            />
            <span className="tabular-nums">
              {reviewed}/{cards.length}
            </span>
          </div>
        </div>
        <Progress value={percent} aria-label="Session progress" />
      </div>

      <CardStack
        cards={remaining}
        flippedKey={flippedKey}
        exitDirection={exitDirection}
        onFlip={toggleFlip}
        onRate={handleRate}
      />

      <RatingButtons onRate={handleRate} />

      <p className="text-center text-xs text-muted-foreground">
        Space or Enter flips the card. Swipe it, or use the left and right arrow
        keys: left is incorrect, right is correct.
      </p>
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("a, button, input, select, textarea, [role='button']") !==
      null
  );
}

/** A card face, as opposed to a control that happens to sit near one. */
function isCardFace(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.closest("[data-card-face]") !== null
  );
}

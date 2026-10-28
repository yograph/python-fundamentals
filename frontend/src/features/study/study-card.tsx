import { motion, type Transition } from "motion/react";

import { RichText } from "@/components/rich-text";
import { stripFormatting } from "@/lib/markup";
import type { LanguageInfo } from "@/types/deck";

import type { StudyCard } from "./session-queue";

interface StudyCardViewProps {
  card: StudyCard;
  flipped: boolean;
  /** Chosen by the stack, so the flip and the swipe share one motion vocabulary. */
  transition: Transition;
  onFlip: () => void;
}

/**
 * The flippable card: tap a face, or press Space/Enter, to turn it over.
 *
 * The turn is a motion animation on `rotateY` rather than a CSS class, so it is
 * the same animation system that drives the swipe and the stack. What stays
 * plain CSS is the 3D setup - `perspective` on the wrapper, `preserve-3d` on
 * the turning element and a hidden backface on each face - because those are
 * static properties, not animations.
 */
export function StudyCardView({
  card,
  flipped,
  transition,
  onFlip,
}: StudyCardViewProps) {
  return (
    <div className="absolute inset-0" style={{ perspective: 1200 }}>
      <motion.div
        className="relative size-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={transition}
      >
        <CardFace
          text={card.prompt}
          language={card.promptLanguage}
          otherSideLabel={card.answerLanguage.label}
          visible={!flipped}
          onFlip={onFlip}
        />
        <CardFace
          text={card.answer}
          language={card.answerLanguage}
          otherSideLabel={card.promptLanguage.label}
          visible={flipped}
          turnedAround
          onFlip={onFlip}
        />
      </motion.div>
    </div>
  );
}

interface CardFaceProps {
  text: string;
  language: LanguageInfo;
  otherSideLabel: string;
  visible: boolean;
  /** The back face starts half a turn ahead, so the pair reads as one sheet. */
  turnedAround?: boolean;
  onFlip: () => void;
}

function CardFace({
  text,
  language,
  otherSideLabel,
  visible,
  turnedAround,
  onFlip,
}: CardFaceProps) {
  // The face renders `text` as markup; anything a screen reader consumes gets
  // the plain-text projection instead, so nobody hears asterisks.
  const plain = stripFormatting(text);

  return (
    // `inert` keeps the face that is turned away out of the tab order and out
    // of the accessibility tree, so the answer cannot leak before the flip.
    <div
      inert={!visible}
      style={{
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        transform: turnedAround ? "rotateY(180deg)" : undefined,
      }}
      className="absolute inset-0 overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-foreground/10"
    >
      {/* The label carries the stripped text because it overrides the button's
          contents as the accessible name - without it the card face would be
          silent to a screen reader, and with the raw text it would spell out
          the delimiters. */}
      <button
        type="button"
        // Marks this button as the card itself rather than a control on it, so
        // the session's verdict keys still work while it holds focus.
        data-card-face="true"
        onClick={onFlip}
        aria-label={`${language.label}: ${plain}. Show the ${otherSideLabel} side`}
        className="flex size-full cursor-pointer flex-col items-center justify-center gap-3 p-6 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {language.label}
        </span>
        <span className="text-center text-4xl font-semibold break-words text-balance sm:text-5xl">
          <RichText text={text} />
        </span>
      </button>
    </div>
  );
}

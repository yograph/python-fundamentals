import {
  AnimatePresence,
  animate,
  type MotionValue,
  motion,
  type Transition,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from "motion/react";

import type { StudyCard } from "./session-queue";
import { StudyCardView } from "./study-card";

/**
 * The deck as a stack of cards you throw away.
 *
 * Three rules hold this together:
 *
 * 1. **Only the front card is real.** It is the only one that drags, the only
 *    one that is not `inert`, and the only one that can be clicked. The cards
 *    behind it are scenery that happens to be the next card already in place.
 * 2. **Depth is derived, never stored.** A card's position in the stack is its
 *    index in the queue, so committing a rating is a queue change and the
 *    cards behind slide forward on their own - the same motion, whether the
 *    verdict came from a swipe, a button or a key.
 * 3. **At most three cards are mounted.** The queue can be hundreds of words;
 *    mounting them all to render two visible slivers would be absurd.
 */

/** How many cards are mounted: the front one, plus the two peeking behind it. */
const VISIBLE_CARDS = 3;

/** Past this much horizontal travel, letting go commits the verdict. */
const SWIPE_DISTANCE = 96;
/** A flick can commit earlier, as long as it went somewhere at all. */
const SWIPE_VELOCITY = 550;
const MIN_COMMIT_DISTANCE = 24;
/** Below this, a release is a tap on the card rather than the end of a swipe. */
const TAP_SLOP = 4;

/** How far the card is thrown when it leaves. Comfortably off any viewport. */
const FLY_OUT_DISTANCE = 640;

const SPRING: Transition = { type: "spring", stiffness: 320, damping: 32 };
const SPRING_BACK: Transition = { type: "spring", stiffness: 500, damping: 38 };
const INSTANT: Transition = { duration: 0 };

/**
 * The exit, as a dynamic variant. `AnimatePresence` hands its `custom` prop to
 * children that are leaving, which is how the card learns which way to fly:
 * the verdict is known one render before the card is gone.
 *
 * Only `x` is animated. The tilt is derived from `x` further down, so animating
 * it here would give one value two writers - and the derived one would win on
 * every frame it was recalculated.
 */
const FLY_OUT: Variants = {
  out: (direction: number) => ({
    x: direction * FLY_OUT_DISTANCE,
    opacity: 0,
    transition: { duration: 0.28, ease: "easeOut" },
  }),
};

/** Reduced motion: no throw, no fade out over time, just gone. */
const VANISH: Variants = {
  out: { opacity: 0, transition: INSTANT },
};

/**
 * A card sits a little smaller, a little lower and a little dimmer for every
 * card in front of it.
 *
 * The numbers are picked so the cards behind clear the front card's bottom edge
 * by a few pixels: scaling from the centre pulls that edge *up* by about half
 * the size it loses, so the offset has to beat that before anything is visible
 * at all. They also have to stay inside the gap below the stack, which is why
 * the offset is this small.
 */
const depthScale = (depth: number) => 1 - depth * 0.045;
const depthOffset = (depth: number) => depth * 16;
const depthOpacity = (depth: number) => 1 - depth * 0.12;

interface CardStackProps {
  /** The queue, front card first. Only the first few are mounted. */
  cards: StudyCard[];
  /** Which card is showing its answer, by word id. */
  flippedKey: string | null;
  /** 1 when the last verdict was "correct", -1 when it was "incorrect". */
  exitDirection: 1 | -1;
  onFlip: () => void;
  onRate: (known: boolean) => void;
}

export function CardStack({
  cards,
  flippedKey,
  exitDirection,
  onFlip,
  onRate,
}: CardStackProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm">
      {/* `initial={false}` keeps the stack from animating in on the first
          render; cards that join later still slide up from behind. */}
      <AnimatePresence initial={false} custom={exitDirection}>
        {cards.slice(0, VISIBLE_CARDS).map((card, depth) => (
          <StackCard
            key={card.wordId}
            card={card}
            depth={depth}
            flipped={flippedKey === card.wordId}
            reduceMotion={reduceMotion}
            onFlip={onFlip}
            onRate={onRate}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface StackCardProps {
  card: StudyCard;
  depth: number;
  flipped: boolean;
  reduceMotion: boolean;
  onFlip: () => void;
  onRate: (known: boolean) => void;
}

function StackCard({
  card,
  depth,
  flipped,
  reduceMotion,
  onFlip,
  onRate,
}: StackCardProps) {
  // A leaving card keeps rendering until its exit finishes, and keeps the depth
  // it had - so it must stop being the interactive one, and must stay above the
  // card that has taken its place.
  const isPresent = useIsPresent();
  const isFront = depth === 0 && isPresent;

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], [-12, 0, 12]);
  // The verdicts fade in over the same distance that commits them, so the
  // gesture says what it will do before you let go.
  const correctOpacity = useTransform(
    x,
    [MIN_COMMIT_DISTANCE, SWIPE_DISTANCE],
    [0, 1],
  );
  const incorrectOpacity = useTransform(
    x,
    [-SWIPE_DISTANCE, -MIN_COMMIT_DISTANCE],
    [1, 0],
  );

  const handleRelease = (offset: number, velocity: number) => {
    const wentFar = Math.abs(offset) > SWIPE_DISTANCE;
    const wentFast =
      Math.abs(velocity) > SWIPE_VELOCITY &&
      Math.abs(offset) > MIN_COMMIT_DISTANCE;

    if (!wentFar && !wentFast) {
      // Undecided: back to the middle, nothing rated.
      if (reduceMotion) x.set(0);
      else animate(x, 0, SPRING_BACK);
      return;
    }

    // Right is correct, left is incorrect - the same way round as the arrow
    // keys and the buttons. Rating drops this card from the queue, and the exit
    // animation carries it the rest of the way from wherever it was let go.
    onRate(offset > 0);
  };

  const handleFlip = () => {
    // A swipe ends with a click on the face it started on. The card is still
    // off-centre at that point, which is what tells the two apart.
    if (Math.abs(x.get()) > TAP_SLOP) return;
    onFlip();
  };

  return (
    <motion.div
      className="absolute inset-0"
      style={{
        x,
        rotate,
        // The card on its way out has to outrank the one that replaced it.
        zIndex: VISIBLE_CARDS - depth + (isPresent ? 0 : VISIBLE_CARDS),
        pointerEvents: isFront ? "auto" : "none",
      }}
      // A card joins the stack from one slot further back, so it rises into
      // place instead of appearing.
      initial={{
        scale: depthScale(depth + 1),
        y: depthOffset(depth + 1),
        opacity: 0,
      }}
      animate={{
        scale: depthScale(depth),
        y: depthOffset(depth),
        opacity: depthOpacity(depth),
      }}
      transition={reduceMotion ? INSTANT : SPRING}
      variants={reduceMotion ? VANISH : FLY_OUT}
      exit="out"
      drag={isFront ? "x" : false}
      // No inertia after release: either this card is leaving, or it is coming
      // back to the middle. Drifting is neither.
      dragMomentum={false}
      onDragEnd={(_event, info) =>
        handleRelease(info.offset.x, info.velocity.x)
      }
      inert={!isFront}
    >
      <StudyCardView
        card={card}
        flipped={flipped}
        transition={reduceMotion ? INSTANT : SPRING}
        onFlip={handleFlip}
      />
      {/* Outside the flipping element on purpose: these must not turn with the
          card, and they must paint over both faces. */}
      <SwipeVerdict label="Incorrect" side="left" opacity={incorrectOpacity} />
      <SwipeVerdict label="Correct" side="right" opacity={correctOpacity} />
    </motion.div>
  );
}

interface SwipeVerdictProps {
  label: string;
  side: "left" | "right";
  opacity: MotionValue<number>;
}

/**
 * The stamp that appears under your thumb as you drag. Decorative: the rating
 * buttons carry the same two words, in text, permanently.
 */
function SwipeVerdict({ label, side, opacity }: SwipeVerdictProps) {
  const isCorrect = side === "right";

  return (
    <motion.div
      aria-hidden="true"
      style={{ opacity }}
      className={
        isCorrect
          ? "pointer-events-none absolute top-5 right-5 rotate-6 rounded-lg border-2 border-primary/60 px-3 py-1 text-sm font-semibold tracking-wide text-primary uppercase"
          : "pointer-events-none absolute top-5 left-5 -rotate-6 rounded-lg border-2 border-destructive/60 px-3 py-1 text-sm font-semibold tracking-wide text-destructive uppercase"
      }
    >
      {label}
    </motion.div>
  );
}

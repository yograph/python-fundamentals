const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ScoreRingProps {
  known: number;
  total: number;
  /** Caption under the numbers. Defaults to the study session's wording. */
  sublabel?: string;
  /** Accessible description of the whole ring. Defaults to study wording. */
  ariaLabel?: string;
}

/**
 * The round score from the previous version, with the numbers in the middle.
 * Shared between the study and practice completion screens — only the wording
 * differs, so the wording is the prop.
 */
export function ScoreRing({
  known,
  total,
  sublabel = "words known",
  ariaLabel = `${known} of ${total} words known`,
}: ScoreRingProps) {
  const ratio = total > 0 ? Math.min(known / total, 1) : 0;

  return (
    <div className="relative mx-auto size-48">
      <svg
        viewBox="0 0 36 36"
        className="size-full -rotate-90"
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          strokeWidth="2"
          className="stroke-muted"
        />
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-3xl font-semibold tabular-nums">
          {known}/{total}
        </span>
        <span className="text-sm text-muted-foreground">{sublabel}</span>
      </div>
    </div>
  );
}

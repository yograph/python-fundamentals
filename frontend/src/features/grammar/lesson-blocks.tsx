import {
  CheckIcon,
  LightbulbIcon,
  ScaleIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

import { CodeBlock } from "@/components/code-block";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { useSpeak } from "@/lib/audio/use-speech";
import { stripFormatting } from "@/lib/markup";
import { cn } from "@/lib/utils";
import type { LessonBlock, LessonExample } from "@/types/exercise";

/** Lesson examples are Dutch; this is the voice they are read in. */
const DUTCH_LOCALE = "nl-NL";

type Speak = (text: string) => void;

interface LessonBlocksProps {
  blocks: LessonBlock[];
  /** The level's colour, used for the rule boxes and accents. */
  color: string;
}

/**
 * A lesson's body. Each block type maps to one fixed component, and every
 * string goes through `RichText` — so lesson data, like card data, can carry
 * bold and italics but never HTML. The exception is code (`code` and `bug`
 * blocks), which `CodeBlock` shows verbatim.
 */
export function LessonBlocks({ blocks, color }: LessonBlocksProps) {
  const { speak: speakIn, isAvailable } = useSpeak();
  // One speaker for the whole lesson, and a button only where a voice exists:
  // a silent button would read as broken.
  const canSpeak = isAvailable("hallo", DUTCH_LOCALE);
  const speak: Speak | null = canSpeak
    ? (text) => speakIn(text, DUTCH_LOCALE)
    : null;

  return (
    <div
      // Bold marks the grammar point in every example and table, so it takes
      // the level's colour - mixed toward the text colour so it stays legible
      // in both themes.
      className="flex flex-col gap-5 text-base leading-relaxed [&_strong]:font-semibold [&_strong]:text-[color-mix(in_oklab,var(--set-accent)_70%,var(--foreground))]"
      style={{ "--set-accent": color } as CSSProperties}
    >
      {blocks.map((block, index) => (
        // Blocks are authored in order and never reordered at runtime.
        // biome-ignore lint/suspicious/noArrayIndexKey: position is identity here
        <Block key={index} block={block} speak={speak} />
      ))}
    </div>
  );
}

function Block({ block, speak }: { block: LessonBlock; speak: Speak | null }) {
  switch (block.type) {
    case "heading":
      return (
        <h2 className="font-heading mt-3 text-xl font-semibold tracking-tight">
          <RichText text={block.text} />
        </h2>
      );
    case "text":
      return (
        <p>
          <RichText text={block.text} />
        </p>
      );
    case "rule":
      return (
        <div className="rounded-xl border-l-4 border-[var(--set-accent)] bg-[color-mix(in_oklab,var(--set-accent)_9%,transparent)] px-4 py-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--set-accent)] uppercase">
            <ScaleIcon className="size-3.5" aria-hidden="true" />
            Rule
          </p>
          <p className="font-medium">
            <RichText text={block.text} />
          </p>
        </div>
      );
    case "tip":
      return (
        <div className="flex gap-3 rounded-xl border bg-muted/50 px-4 py-3">
          <LightbulbIcon
            className="mt-1 size-4 shrink-0 text-amber-500"
            aria-label="Tip"
          />
          <p className="text-sm leading-relaxed">
            <RichText text={block.text} />
          </p>
        </div>
      );
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-[var(--set-accent)]">
          {block.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: authored order
            <li key={index}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <figure className="flex flex-col gap-1.5">
          {block.caption ? (
            <figcaption className="text-sm font-medium text-muted-foreground">
              <RichText text={block.caption} />
            </figcaption>
          ) : null}
          {/* Wide tables scroll inside their own box, never the page. */}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60">
                  {block.headers.map((header, index) => (
                    <th
                      // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                      key={index}
                      scope="col"
                      className="px-3 py-2 text-left font-medium whitespace-nowrap"
                    >
                      <RichText text={header} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                  <tr key={rowIndex} className="border-t">
                    {row.map((cell, cellIndex) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                        key={cellIndex}
                        className="px-3 py-2 align-top first:font-medium"
                      >
                        <RichText text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case "examples":
      return (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {block.items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: authored order
            <Example key={index} item={item} speak={speak} />
          ))}
        </ul>
      );
    case "mistake":
      return (
        <div className="flex flex-col gap-1.5 rounded-xl border px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Common mistake
          </p>
          <p className="flex gap-2 text-destructive">
            <XIcon className="mt-1 size-4 shrink-0" aria-label="Wrong" />
            <span className="line-through decoration-1">
              <RichText text={block.wrong} />
            </span>
          </p>
          <p className="flex gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckIcon className="mt-1 size-4 shrink-0" aria-label="Right" />
            <span>
              <RichText text={block.right} />
            </span>
          </p>
          <p className="pl-6 text-sm text-muted-foreground">
            <RichText text={block.why} />
          </p>
        </div>
      );
    case "code":
      return (
        <figure className="flex flex-col gap-1.5">
          {block.caption ? (
            <figcaption className="text-sm font-medium text-muted-foreground">
              <RichText text={block.caption} />
            </figcaption>
          ) : null}
          <div className="overflow-hidden rounded-xl border bg-muted/50">
            <CodeBlock code={block.code} />
            {block.output ? (
              <div className="border-t bg-background/60">
                <p className="px-4 pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Output
                </p>
                <CodeBlock
                  code={block.output}
                  aria-label="Output"
                  className="pt-1 text-muted-foreground"
                />
              </div>
            ) : null}
          </div>
        </figure>
      );
    case "bug":
      return (
        <div className="flex flex-col gap-2 rounded-xl border px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Common mistake
          </p>
          <VerdictCode verdict="wrong" code={block.wrong} />
          <VerdictCode verdict="right" code={block.right} />
          <p className="text-sm text-muted-foreground">
            <RichText text={block.why} />
          </p>
        </div>
      );
  }
}

/** One side of a `bug` block: the code, tinted and labelled by its verdict. */
function VerdictCode({
  verdict,
  code,
}: {
  verdict: "wrong" | "right";
  code: string;
}) {
  const isWrong = verdict === "wrong";
  const Icon = isWrong ? XIcon : CheckIcon;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        isWrong
          ? "border-destructive/40 bg-destructive/5"
          : "border-emerald-600/40 bg-emerald-600/5",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 px-3 pt-2 text-xs font-semibold tracking-wide uppercase",
          isWrong
            ? "text-destructive"
            : "text-emerald-700 dark:text-emerald-400",
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {isWrong ? "Wrong" : "Right"}
      </p>
      <CodeBlock code={code} className="px-3 pt-1 pb-2.5" />
    </div>
  );
}

function Example({
  item,
  speak,
}: {
  item: LessonExample;
  speak: Speak | null;
}) {
  return (
    <li className="flex items-start gap-2 px-3 py-2.5">
      {speak ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1 shrink-0 text-muted-foreground"
          aria-label={`Listen: ${stripFormatting(item.nl)}`}
          onClick={() => speak(item.nl)}
        >
          <Volume2Icon />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium">
          <RichText text={item.nl} />
        </p>
        <p className="text-sm text-muted-foreground">
          <RichText text={item.en} />
        </p>
        {item.note ? (
          <p className="text-xs text-muted-foreground italic">
            <RichText text={item.note} />
          </p>
        ) : null}
      </div>
    </li>
  );
}

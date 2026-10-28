import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Shared so the loading line sits exactly where the trigger will. */
const SUMMARY_CLASS = "flex min-h-11 items-center gap-1.5 text-sm";

interface TagFilterProps {
  /**
   * Every topic in the deck, sorted. `null` while the deck is still loading -
   * the line keeps its place instead of appearing late and shifting the page.
   */
  tags: string[] | null;
  /** The active subset, or `null` for every topic. */
  selected: string[] | null;
  onChange: (next: string[] | null) => void;
}

/**
 * Tag selection, deliberately quiet.
 *
 * Topics used to be the first thing on the deck screen: a scrolling row of
 * chips that had to be dealt with before starting. In practice decks are split
 * by topic already, so the answer is almost always "all of them" - which makes a
 * required step out of a filter nobody reaches for. Here it collapses to one
 * summarising line that says what is active, and only expands when someone
 * actually wants to narrow the deck down.
 */
export function TagFilter({ tags, selected, onChange }: TagFilterProps) {
  // A deck with no tags at all has nothing to filter, so the line disappears
  // entirely rather than offering an empty list.
  if (tags !== null && tags.length === 0) return null;

  if (tags === null) {
    return (
      <p className={cn(SUMMARY_CLASS, "text-muted-foreground")}>All topics</p>
    );
  }

  const active = selected ?? tags;
  const everyTopic = selected === null;

  const summary = everyTopic
    ? `All ${tags.length} ${tags.length === 1 ? "topic" : "topics"}`
    : `${active.length} of ${tags.length} topics: ${active
        .map((tag) => `#${tag}`)
        .join(", ")}`;

  const toggle = (tag: string) => {
    const next = active.includes(tag)
      ? active.filter((current) => current !== tag)
      : [...active, tag];

    // Every topic and no topic mean the same thing here: no filter. That is
    // already how the URL reads an empty `tags`, it keeps the link short, and
    // it means clearing the last checkbox can never produce a deck with nothing
    // in it to study.
    onChange(next.length === 0 || next.length === tags.length ? null : next);
  };

  return (
    <Collapsible>
      <CollapsibleTrigger
        className={cn(
          SUMMARY_CLASS,
          "group/tags w-full cursor-pointer rounded-lg text-left text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDownIcon
          className="size-4 shrink-0 transition-transform group-data-[state=open]/tags:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col items-start gap-2 pt-1 pb-2">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const checked = active.includes(tag);

              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(tag)}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    checked
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {checked ? (
                    <CheckIcon className="size-3.5" aria-hidden="true" />
                  ) : null}
                  #{tag}
                </button>
              );
            })}
          </div>
          {everyTopic ? null : (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Select all topics
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

import { type KeyboardEvent, useRef } from "react";

import { cn } from "@/lib/utils";

const INDENT = "    ";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl+Enter or Cmd+Enter. */
  onRun?: () => void;
  /** 1-based line to mark in the gutter, e.g. where an error happened. */
  errorLine?: number | null;
  label: string;
}

/**
 * A plain textarea that types like a small Python editor: Tab indents by four
 * spaces (or indents the selected lines), Shift+Tab dedents, Enter keeps the
 * current indentation and adds a level after a colon, and Backspace in leading
 * spaces removes a whole level. Line numbers match the ones in error messages.
 *
 * Edits go through `execCommand("insertText")` so the browser's own undo still
 * works. Escape releases Tab, so a keyboard user can always tab out.
 */
export function CodeEditor({
  value,
  onChange,
  onRun,
  errorLine,
  label,
}: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const tabReleased = useRef(false);
  const lineCount = value.split("\n").length;

  /** Replaces the selection, keeping undo history where the browser allows. */
  const replaceSelection = (element: HTMLTextAreaElement, text: string) => {
    const done =
      text === ""
        ? document.execCommand("delete")
        : document.execCommand("insertText", false, text);
    if (!done) {
      element.setRangeText(
        text,
        element.selectionStart,
        element.selectionEnd,
        "end",
      );
      onChange(element.value);
    }
  };

  /** Rewrites every line touched by the selection, then reselects them. */
  const transformLines = (
    element: HTMLTextAreaElement,
    transform: (line: string) => string,
  ) => {
    const { selectionStart, selectionEnd } = element;
    const start = value.lastIndexOf("\n", selectionStart - 1) + 1;
    // A selection ending right after a newline does not include the next line.
    const lastChar =
      selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
    let end = value.indexOf("\n", lastChar);
    if (end === -1) end = value.length;
    const block = value.slice(start, end);
    const changed = block.split("\n").map(transform).join("\n");
    if (changed === block) return;
    element.setSelectionRange(start, end);
    replaceSelection(element, changed);
    element.setSelectionRange(start, start + changed.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    const { selectionStart, selectionEnd } = element;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const beforeCursor = value.slice(lineStart, selectionStart);

    if (event.key === "Escape") {
      tabReleased.current = true;
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onRun?.();
      return;
    }
    if (event.key === "Tab" && !tabReleased.current) {
      event.preventDefault();
      const multiLine = value
        .slice(selectionStart, selectionEnd)
        .includes("\n");
      if (event.shiftKey) {
        transformLines(element, (line) =>
          line.replace(new RegExp(`^ {1,${INDENT.length}}`), ""),
        );
      } else if (multiLine) {
        transformLines(element, (line) => (line ? INDENT + line : line));
      } else {
        const column = beforeCursor.length;
        replaceSelection(
          element,
          " ".repeat(INDENT.length - (column % INDENT.length)),
        );
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const indent = beforeCursor.match(/^ */)?.[0] ?? "";
      const opensBlock = beforeCursor.trimEnd().endsWith(":");
      replaceSelection(element, `\n${indent}${opensBlock ? INDENT : ""}`);
      return;
    }
    if (
      event.key === "Backspace" &&
      selectionStart === selectionEnd &&
      beforeCursor.length > 0 &&
      /^ +$/.test(beforeCursor)
    ) {
      event.preventDefault();
      const remove = ((beforeCursor.length - 1) % INDENT.length) + 1;
      element.setSelectionRange(selectionStart - remove, selectionStart);
      replaceSelection(element, "");
    }
  };

  return (
    <div className="flex overflow-hidden rounded-xl border bg-muted/50 font-mono text-base leading-relaxed focus-within:ring-3 focus-within:ring-ring/50 sm:text-sm">
      <div
        aria-hidden="true"
        className="shrink-0 border-r py-3 pr-2 pl-3 text-right text-muted-foreground/60 tabular-nums select-none"
      >
        {Array.from({ length: Math.max(lineCount, 6) }, (_, index) => (
          <div
            // Line numbers are positional by definition.
            // biome-ignore lint/suspicious/noArrayIndexKey: position is identity
            key={index}
            className={cn(
              errorLine === index + 1 && "font-semibold text-destructive",
            )}
          >
            {index + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          tabReleased.current = false;
        }}
        rows={Math.max(lineCount, 6)}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className="min-w-0 flex-1 resize-none overflow-x-auto overflow-y-hidden bg-transparent px-3 py-3 whitespace-pre outline-none placeholder:text-muted-foreground/60"
        placeholder="Type your code here"
      />
    </div>
  );
}

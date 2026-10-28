import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

interface CodeBlockProps extends Omit<ComponentProps<"pre">, "children"> {
  /** Shown exactly as written. */
  code: string;
}

/**
 * Code, or a program's output, shown verbatim: monospace, whitespace kept, and
 * never parsed as markup — `**` and `__` are everyday Python, not bold and
 * underline. Long lines scroll inside the box instead of wrapping, because a
 * wrapped line of code reads as two lines.
 *
 * Domain-free, like `RichText`: it knows about code, not about lessons.
 */
export function CodeBlock({ code, className, ...props }: CodeBlockProps) {
  return (
    <pre
      className={cn(
        "overflow-x-auto px-4 py-3 font-mono text-[0.8125rem] leading-relaxed sm:text-sm",
        className,
      )}
      {...props}
    >
      <code>{code}</code>
    </pre>
  );
}

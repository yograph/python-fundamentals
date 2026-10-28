import { Fragment, type ReactNode } from "react";
import { type InlineNode, parseInline } from "@/lib/markup";

/**
 * Renders the inline formatting a word's `front`/`back` may carry.
 *
 * The parse output is turned into real React elements - `<strong>`, `<em>`,
 * `<u>` - and **never** into HTML via `dangerouslySetInnerHTML`. That is the
 * entire point of hand-parsing a three-marker subset instead of reaching for a
 * markdown library: card text arrives from files a workflow can write, so the
 * renderer must have no injection surface at all. Text nodes go through React's
 * normal escaping, and the only tags that can ever appear are the three above.
 *
 * Domain-free, so it lives in `components/` rather than a feature folder: it
 * knows about the markup subset, not about decks.
 */

interface RichTextProps {
  /** Text possibly containing `**bold**`, `*italic*` or `__underline__`. */
  text: string;
}

/** Tag per mark. `<u>` is the underline; there is no fourth option. */
const MARK_TAG = {
  strong: "strong",
  em: "em",
  underline: "u",
} as const;

function renderNodes(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    // Nodes are derived from immutable text and never reordered, so their
    // position is a stable identity.
    const key = `${index}:${node.type}`;

    if (node.type === "text") {
      return <Fragment key={key}>{node.value}</Fragment>;
    }

    const Tag = MARK_TAG[node.type];
    return <Tag key={key}>{renderNodes(node.children)}</Tag>;
  });
}

export function RichText({ text }: RichTextProps) {
  return <>{renderNodes(parseInline(text))}</>;
}

// For the plain-text contexts a component cannot fill - `aria-label`, `title`,
// comparisons - call `stripFormatting` from `@/lib/markup` directly. Screen
// readers should hear what sighted users read, so those places want the stripped
// text rather than the raw text; re-exporting it from here would route a `lib/`
// dependency through `components/` and invert the layering.

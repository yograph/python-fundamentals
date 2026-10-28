/**
 * Inline formatting for card text: `**bold**`, `*italic*`, `__underline__`.
 *
 * The stable import path for the whole subset. `@/lib/markup` is what callers
 * use - `stripFormatting` in particular is imported by `lib/audio` to build clip
 * keys and by the UI for plain-text contexts, so its path is part of the
 * contract between those modules.
 */

export {
  type InlineMark,
  type InlineMarkNode,
  type InlineNode,
  type InlineTextNode,
  parseInline,
} from "./parse";
export { hasFormatting, stripFormatting } from "./strip";

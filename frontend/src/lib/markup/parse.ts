/**
 * The inline-formatting subset from `docs/DATA_CONTRACT.md`, parsed into nodes.
 *
 *   `**bold**`      -> strong
 *   `*italic*`      -> em
 *   `__underline__` -> underline
 *
 * This is a deliberate port of `tools/data-tools/src/markup.mjs`, the reference
 * implementation, down to the algorithm: `stripFormatting` (see `./strip.ts`) is
 * how audio clip keys are built, so a disagreement of one character between the
 * two makes the app look up a key the generator never wrote and audio silently
 * disappears. Anything cleverer here would be a bug waiting to happen, so the
 * shape of the code is kept recognisably the same to make diffing the two easy.
 *
 * The rules, and why each is what it is:
 *
 * - `\*`, `\_` and `\\` are literal escapes. A backslash before anything else is
 *   a literal backslash, so `C:\path` survives untouched.
 * - Delimiters may nest: `**a *b* c**`.
 * - **An unbalanced or unrecognised delimiter is literal text, never an error.**
 *   Data must not be able to break a card, so `2 * 3` renders as `2 * 3` and
 *   `un**balanced` renders with its asterisks showing.
 * - A single `_` is not a delimiter (only `__` is): underscores occur inside
 *   ordinary text far more often than they mean emphasis.
 * - No CommonMark "flanking" rules. `a * b * c` really does italicise `" b "`.
 *   Flanking is where markdown implementations famously diverge, and three
 *   implementations of this subset have to agree exactly.
 * - Empty emphasis (`****`) is literal text rather than an empty element, so
 *   nothing silently vanishes.
 * - Closing prefers the innermost open delimiter of the same marker, so
 *   `**a **b** c**` gives strong("a ") + "b" + strong(" c").
 *
 * Nothing in this module throws, and there is no error path to handle: the
 * worst input produces text nodes.
 */

/** The formatting a node can carry. `underline` is rendered as `<u>`. */
export type InlineMark = "strong" | "em" | "underline";

export interface InlineTextNode {
  type: "text";
  value: string;
}

export interface InlineMarkNode {
  type: InlineMark;
  children: InlineNode[];
}

export type InlineNode = InlineTextNode | InlineMarkNode;

/** Recognised delimiters, longest first so `**` never reads as two `*`. */
const MARKERS = ["**", "__", "*"] as const;

type Marker = (typeof MARKERS)[number];

const MARKER_MARK: Record<Marker, InlineMark> = {
  "**": "strong",
  "*": "em",
  __: "underline",
};

/** Characters a backslash can escape. */
const ESCAPABLE = new Set(["*", "_", "\\"]);

type Token =
  | { type: "text"; value: string }
  | { type: "delimiter"; marker: Marker };

/**
 * Splits text into literal runs and delimiter tokens, resolving escapes on the
 * way. After this pass an escaped `\*` is indistinguishable from any other
 * character, which is precisely what makes it literal.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];

  const pushText = (value: string) => {
    if (value === "") return;
    const last = tokens.at(-1);
    if (last?.type === "text") last.value += value;
    else tokens.push({ type: "text", value });
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];

    if (char === "\\") {
      const next = text[index + 1];
      if (next !== undefined && ESCAPABLE.has(next)) {
        pushText(next);
        index += 2;
        continue;
      }
      // Lone backslash: literal, and it does not escape the next character.
      pushText("\\");
      index += 1;
      continue;
    }

    const marker = MARKERS.find((candidate) =>
      text.startsWith(candidate, index),
    );
    if (marker) {
      tokens.push({ type: "delimiter", marker });
      index += marker.length;
      continue;
    }

    pushText(char);
    index += 1;
  }

  return tokens;
}

function appendText(nodes: InlineNode[], value: string): void {
  if (value === "") return;
  const last = nodes.at(-1);
  if (last?.type === "text") last.value += value;
  else nodes.push({ type: "text", value });
}

interface ParseResult {
  nodes: InlineNode[];
  next: number;
  closed: boolean;
}

/**
 * Parses tokens until `closer` is met, or until the input runs out (which means
 * the opener was unbalanced and the caller re-emits it as literal text).
 *
 * `noCloser` memoises `(start, closer)` pairs already known to have no matching
 * closer. Without it, a run of never-closing delimiters such as `*__*__*__…`
 * makes the "re-parse the tail as literal" step exponential. Failed parses are
 * discarded anyway, so caching only the failures is both safe and sufficient.
 */
function parseNodes(
  tokens: Token[],
  start: number,
  closer: Marker | null,
  noCloser: Set<string>,
): ParseResult {
  const nodes: InlineNode[] = [];
  let index = start;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.type === "text") {
      appendText(nodes, token.value);
      index += 1;
      continue;
    }

    if (closer !== null && token.marker === closer) {
      return { nodes, next: index + 1, closed: true };
    }

    const memoKey = `${index + 1}|${token.marker}`;
    const inner = noCloser.has(memoKey)
      ? null
      : parseNodes(tokens, index + 1, token.marker, noCloser);

    if (inner === null || !inner.closed) {
      noCloser.add(memoKey);
      // No matching closer, so the opener is content. Everything after it is
      // re-parsed from scratch, which is what lets a later balanced pair work.
      appendText(nodes, token.marker);
      index += 1;
      continue;
    }

    if (inner.nodes.length === 0) {
      // Empty emphasis: both delimiters are literal, so nothing disappears.
      appendText(nodes, token.marker + token.marker);
      index = inner.next;
      continue;
    }

    nodes.push({ type: MARKER_MARK[token.marker], children: inner.nodes });
    index = inner.next;
  }

  return { nodes, next: index, closed: closer === null };
}

/**
 * Parses inline markup into a node tree. Never throws: any delimiter that
 * cannot be paired up comes back as a text node containing the delimiter.
 */
export function parseInline(text: string): InlineNode[] {
  if (typeof text !== "string" || text === "") return [];
  return parseNodes(tokenize(text), 0, null, new Set()).nodes;
}

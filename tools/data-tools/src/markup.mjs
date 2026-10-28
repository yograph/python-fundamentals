// Reference implementation of the inline-formatting subset in
// docs/DATA_CONTRACT.md ("Inline formatting"). `front` and `back` may use it;
// `id`, `tags` and everything in library.json are always plain text.
//
//   **bold**        -> strong
//   *italic*        -> em
//   __underline__   -> u
//
// Rules, and the reasoning behind each:
//
//   - `\*`, `\_` and `\\` are literal escapes. A backslash before anything else
//     is a literal backslash (so `C:\path` survives untouched).
//   - Delimiters may nest: `**a *b* c**`.
//   - An unbalanced or unrecognised delimiter is LITERAL TEXT, never an error.
//     Data must not be able to break a card. `2 * 3` renders as `2 * 3`.
//   - A single `_` is not a delimiter at all (only `__` is), because underscores
//     occur inside ordinary text far more often than they mean emphasis.
//   - There are no "flanking" rules. Unlike CommonMark, `a * b * c` really does
//     produce an italic containing " b ".
//   - Empty emphasis is literal: `**`, `****` and `____` have no content to
//     emphasize, so they stay exactly as written rather than becoming an empty
//     element. Nothing silently vanishes.
//   - Closing prefers the innermost open delimiter of the same marker, so
//     `**a **b** c**` yields strong("a ") + "b" + strong(" c") — the same thing
//     markdown does, and not something that can loop.
//
// MATCHING IS BY WHOLE TOKEN. The tokenizer takes the longest marker at each
// position (`**`, then `__`, then `*`) and a token that finds no partner is
// literal text WHERE IT STANDS — tokens are never split, and a leftover is never
// moved inside the element it sits next to. So `***x***` tokenizes as `**` `*` x
// `**` `*`, the `**` pair cannot close across the `*` pair, and the result is the
// literal text `**` followed by em("x**"), stripping to `**x**`.
//
// That is deliberately NOT CommonMark's delimiter-run algorithm, which would
// pair the shortest delimiter and pull the remainder inside the element. Three
// implementations have to agree character for character (see the note below), so
// the rule that matters is the one that is simplest to reimplement, not the one
// that is most principled for text nobody writes. A run of three or more
// delimiters is consequently not a usable construct at all: write `**a *b* c**`
// for bold-and-italic. validateInline() warns about such runs so the author
// finds out, but it is only ever a warning.
//
// stripFormatting() is the function audio keys on: the clip key is
// `${locale}:${stripFormatting(text)}`. Any tool touching audio must produce
// exactly the same string, which is why this file is the single reference. It is
// differentially fuzzed against tools/audio-gen/src/format.mjs and
// frontend/src/lib/markup/strip.ts; that corpus must show zero mismatches, or
// clips silently orphan.

/** Markers recognised as delimiters, longest first so `**` beats `*`. */
const MARKERS = ["**", "__", "*"];

/** marker -> node type. */
const NODE_TYPE = { "**": "strong", "*": "em", __: "u" };

/**
 * Splits text into literal-text and delimiter tokens, resolving escapes.
 *
 * Also reports runs of three or more delimiter characters. That is a purely
 * lexical observation, independent of how the tokens later pair up, which is
 * what makes it a stable thing to warn about.
 *
 * @param {string} text
 * @returns {{tokens: Array<object>, runs: Array<{char: string, length: number, at: number}>}}
 */
function tokenize(text) {
  const tokens = [];
  /** @type {Array<{char: string, length: number, at: number}>} */
  const runs = [];
  const pushText = (value) => {
    const last = tokens.at(-1);
    if (last?.type === "text") last.value += value;
    else tokens.push({ type: "text", value });
  };

  let index = 0;
  // End of the last run already measured, so a run of 5 is reported once rather
  // than again from the middle after its first two characters are consumed.
  let measuredThrough = -1;
  while (index < text.length) {
    const char = text[index];

    if (char === "\\") {
      const next = text[index + 1];
      if (next === "*" || next === "_" || next === "\\") {
        pushText(next);
        index += 2;
        continue;
      }
      // Lone backslash: literal, and it does not escape the next character.
      pushText("\\");
      index += 1;
      continue;
    }

    if ((char === "*" || char === "_") && index >= measuredThrough) {
      let end = index;
      while (text[end] === char) end += 1;
      measuredThrough = end;
      if (end - index >= 3) {
        runs.push({ char, length: end - index, at: index });
      }
      // Note we do NOT consume the run here: tokens are still taken one marker
      // at a time, longest first, exactly as before. The run is only measured.
    }

    const marker = MARKERS.find((candidate) =>
      text.startsWith(candidate, index),
    );
    if (marker) {
      tokens.push({ type: "delim", marker, at: index });
      index += marker.length;
      continue;
    }

    pushText(char);
    index += 1;
  }

  return { tokens, runs };
}

/**
 * @typedef {{type: "text", value: string}} TextNode
 * @typedef {{type: "strong" | "em" | "u", children: Node[]}} ElementNode
 * @typedef {TextNode | ElementNode} Node
 */

function appendText(nodes, value) {
  if (value === "") return;
  const last = nodes.at(-1);
  if (last?.type === "text") last.value += value;
  else nodes.push({ type: "text", value });
}

/**
 * Parses tokens until `closer` is met (or the end of input).
 *
 * `noCloser` memoizes (start, closer) pairs already known to have no matching
 * closer. Without it, a run of never-closing delimiters such as `*__*__*__…`
 * makes the "re-parse the tail as literal" step exponential; failed parses are
 * discarded anyway, so caching just the failures is both safe and enough.
 *
 * @returns {{nodes: Node[], next: number, closed: boolean, unbalanced: Array<{marker: string, at: number}>}}
 */
function parseNodes(tokens, start, closer, noCloser) {
  /** @type {Node[]} */
  const nodes = [];
  /** @type {Array<{marker: string, at: number}>} */
  const unbalanced = [];
  let index = start;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.type === "text") {
      appendText(nodes, token.value);
      index += 1;
      continue;
    }

    if (closer !== null && token.marker === closer) {
      return { nodes, next: index + 1, closed: true, unbalanced };
    }

    const memoKey = `${index + 1}|${token.marker}`;
    const inner = noCloser.has(memoKey)
      ? { closed: false }
      : parseNodes(tokens, index + 1, token.marker, noCloser);
    if (!inner.closed) {
      noCloser.add(memoKey);
      // No matching closer: the opener is literal text where it stands.
      // Everything after it is re-parsed from scratch, so a later balanced pair
      // still works.
      appendText(nodes, token.marker);
      unbalanced.push({ marker: token.marker, at: token.at });
      index += 1;
      continue;
    }
    if (inner.nodes.length === 0) {
      // Empty emphasis: both delimiters are literal.
      appendText(nodes, token.marker + token.marker);
      index = inner.next;
      continue;
    }
    nodes.push({ type: NODE_TYPE[token.marker], children: inner.nodes });
    unbalanced.push(...inner.unbalanced);
    index = inner.next;
  }

  return { nodes, next: index, closed: closer === null, unbalanced };
}

/**
 * Parses inline markup into a node tree. Never throws and never fails: any
 * delimiter it cannot pair up comes back as literal text, and is also reported
 * so a validator can warn about a likely typo.
 *
 * `unbalanced` lists delimiters with no partner; `runs` lists runs of three or
 * more delimiter characters, which cannot form a construct under whole-token
 * matching. Both are warning material only.
 *
 * @param {string} text
 * @returns {{
 *   nodes: Node[],
 *   unbalanced: Array<{marker: string, at: number}>,
 *   runs: Array<{char: string, length: number, at: number}>,
 * }}
 */
export function parseInline(text) {
  const { tokens, runs } = tokenize(String(text ?? ""));
  const result = parseNodes(tokens, 0, null, new Set());
  return { nodes: result.nodes, unbalanced: result.unbalanced, runs };
}

/**
 * Human-readable complaints about markup that will not come out as anyone
 * probably intended. Empty array means every delimiter paired up cleanly and
 * there are no oversized runs. These are WARNINGS by contract: the text still
 * renders, it just renders literally.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function validateInline(text) {
  const { unbalanced, runs } = parseInline(text);
  const messages = [];

  const unbalancedCounts = new Map();
  for (const { marker } of unbalanced) {
    unbalancedCounts.set(marker, (unbalancedCounts.get(marker) ?? 0) + 1);
  }
  for (const [marker, count] of unbalancedCounts) {
    messages.push(
      `unbalanced "${marker}" (${count} occurrence(s)) — renders as literal text`,
    );
  }

  const runCounts = new Map();
  for (const { char } of runs) {
    runCounts.set(char, (runCounts.get(char) ?? 0) + 1);
  }
  for (const [char, count] of runCounts) {
    messages.push(
      `a run of 3+ "${char}" is not a construct (${count} occurrence(s))` +
        " — the extra characters render as literal text; nest explicitly instead," +
        " as in **a *b* c**",
    );
  }

  return messages;
}

/**
 * The plain text of a formatted string: delimiters removed, escapes resolved,
 * everything else left exactly as-is (no trimming, no whitespace collapsing).
 * This is what audio clips are keyed on.
 *
 *   "de **man**"     -> "de man"
 *   "\\*literal\\*"  -> "*literal*"
 *   "**a *b* c**"    -> "a b c"
 *   "2 * 3"          -> "2 * 3"      (unbalanced marker stays literal)
 *   "***x***"        -> "**x**"      (a 3+ run is not a construct)
 *
 * @param {string} text
 * @returns {string}
 */
export function stripFormatting(text) {
  const flatten = (nodes) =>
    nodes
      .map((node) =>
        node.type === "text" ? node.value : flatten(node.children),
      )
      .join("");
  return flatten(parseInline(text).nodes);
}

/** True when the text contains any markup that stripFormatting would remove. */
export function hasFormatting(text) {
  return stripFormatting(text) !== String(text ?? "");
}

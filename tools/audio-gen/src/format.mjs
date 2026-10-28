/**
 * The inline-markdown subset from docs/DATA_CONTRACT.md, reduced to plain text.
 *
 * `**bold**`, `*italic*` and `__underline__` are the only markup, `\*` `\_` `\\`
 * are literal escapes, and an unbalanced delimiter is literal text rather than
 * an error. Stripping matters because the clip key is built from the *stripped*
 * text: italicising a word must not orphan its clip or trigger regeneration.
 *
 * tools/data-tools/src/markup.mjs is the reference implementation. This is a
 * deliberate re-implementation of the same algorithm rather than an import:
 * audio-gen is a zero-dependency workspace that does not depend on data-tools.
 * The two must agree byte-for-byte, so every rule below mirrors that file:
 *
 *   - markers are matched longest-first, so `**` beats `*`;
 *   - a single `_` is not a delimiter (only `__` is);
 *   - a backslash before anything other than `*`, `_` or `\` is a literal
 *     backslash and does not escape what follows (`C:\path` survives);
 *   - there are no flanking rules, so `a * b * c` really does italicise ` b `;
 *   - empty emphasis (`****`) is literal text, not an empty element;
 *   - an unpaired marker is literal, and the text after it is re-parsed, so a
 *     later balanced pair still works.
 */

/** Markers recognised as delimiters, longest first so `**` beats `*`. */
const MARKERS = ["**", "__", "*"];
const ESCAPABLE = new Set(["*", "_", "\\"]);

/**
 * Split into literal text runs and delimiter tokens, resolving escapes as we
 * go. After this pass an escaped `\*` is indistinguishable from any other
 * character, which is exactly what makes it literal.
 */
function tokenize(input) {
  const tokens = [];

  const pushText = (value) => {
    const last = tokens.at(-1);
    if (last?.type === "text") last.value += value;
    else tokens.push({ type: "text", value });
  };

  let i = 0;
  while (i < input.length) {
    const char = input[i];

    if (char === "\\") {
      if (ESCAPABLE.has(input[i + 1])) {
        pushText(input[i + 1]);
        i += 2;
      } else {
        // Lone backslash: literal, and it does not escape the next character.
        pushText("\\");
        i += 1;
      }
      continue;
    }

    const marker = MARKERS.find((candidate) => input.startsWith(candidate, i));
    if (marker) {
      tokens.push({ type: "delimiter", value: marker });
      i += marker.length;
      continue;
    }

    pushText(char);
    i += 1;
  }

  return tokens;
}

/**
 * Recursive descent over the tokens, flattening straight to text. `closer` is
 * the marker we are inside; reaching the end without seeing it means the opener
 * was unbalanced, and the caller re-emits it as literal text.
 *
 * `noCloser` memoizes (start, closer) pairs already known to have no matching
 * closer. Without it, a run of never-closing delimiters such as `*__*__*__…`
 * makes the "re-parse the tail as literal" step exponential.
 *
 * `parts` only ever receives non-empty strings, so `parts.length === 0` is
 * exactly the reference implementation's "no nodes" test for empty emphasis.
 */
function parse(tokens, start, closer, noCloser) {
  const parts = [];
  let i = start;

  const push = (value) => {
    if (value !== "") parts.push(value);
  };

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === "text") {
      push(token.value);
      i += 1;
      continue;
    }

    if (closer !== null && token.value === closer) {
      return { text: parts.join(""), next: i + 1, closed: true };
    }

    const memoKey = `${i + 1}|${token.value}`;
    const inner = noCloser.has(memoKey)
      ? { closed: false }
      : parse(tokens, i + 1, token.value, noCloser);

    if (!inner.closed) {
      noCloser.add(memoKey);
      // Unbalanced opener: the marker itself is content, and everything after
      // it is re-parsed from scratch.
      push(token.value);
      i += 1;
      continue;
    }
    if (inner.text === "") {
      // Empty emphasis: both markers are literal, so nothing silently vanishes.
      push(token.value + token.value);
      i = inner.next;
      continue;
    }
    push(inner.text);
    i = inner.next;
  }

  return { text: parts.join(""), next: i, closed: closer === null };
}

/**
 * The plain text of a formatted string: delimiters removed, escapes resolved,
 * everything else left exactly as-is (no trimming, no whitespace collapsing).
 * Never throws.
 *
 *   stripFormatting("de **man**")    === "de man"
 *   stripFormatting("\\*literal\\*") === "*literal*"
 *   stripFormatting("**a *b* c**")   === "a b c"
 *   stripFormatting("un**balanced")  === "un**balanced"
 */
export function stripFormatting(text) {
  const input = String(text ?? "");
  // Cheap out on the overwhelmingly common case: no markup characters at all.
  if (!/[*_\\]/.test(input)) return input;
  return parse(tokenize(input), 0, null, new Set()).text;
}

/** True when the text contains any markup that stripFormatting would remove. */
export function hasFormatting(text) {
  return stripFormatting(text) !== String(text ?? "");
}

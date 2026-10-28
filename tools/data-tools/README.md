# @flashcards/data-tools

Zero-dependency Node scripts (ESM, Node >= 20 built-ins only, no `node_modules`)
that build and check the static payload under `data/`. The shape they enforce is
defined in [`docs/DATA_CONTRACT.md`](../../docs/DATA_CONTRACT.md) — schema 2.

Every path is resolved from the scripts' own location (`import.meta.url`), never
from `process.cwd()`, so the commands behave identically from any directory.

## The files, and who owns them

| File                    | Kind      | Edited by            |
| ----------------------- | --------- | -------------------- |
| `data/library.json`     | authored  | a human or an AI     |
| `data/banks/<id>.tsv`   | authored  | a human or an AI     |
| `data/manifest.json`    | generated | `build-manifest.mjs` |
| `data/audio/index.json` | generated | `tools/audio-gen`    |

Nothing derived lives in an authored file, so nothing in an authored file can go
stale. Everything derived is a pure function of those files.

## Commands

| Command            | What it does                                                                          |
| ------------------ | ------------------------------------------------------------------------------------- |
| `npm run manifest` | Regenerates `data/manifest.json` from `library.json` + `banks/*.tsv`. Byte-idempotent. |
| `npm run validate` | Checks `data/` against all seven contract invariants. Exits 1 on any error.            |
| `npm run migrate`  | One-shot schema 1 -> 2 migration. One-shot schema 1 -> 2 migration; no-ops now that schema 1 is gone.                   |

From the repo root: `pnpm data:manifest`, `pnpm data:validate`. Or directly, from
anywhere:

```sh
node tools/data-tools/src/build-manifest.mjs
node tools/data-tools/src/validate.mjs
```

## When to run them

- **After editing a bank or `library.json`** — `manifest`, then `validate`. The
  manifest derives `wordCount` and the content-hash `revision`, so an edited
  bank with a stale manifest fails invariant 6.
- **In CI, on every push** — `validate` only. It never writes. It prints *every*
  problem, grouped by invariant, so one run tells you everything.

There is nothing to "bump" by hand any more. A deck's `revision` is the hash of
its bank file's bytes, so editing the bank changes the cache key automatically.

## Modules

| Module               | Responsibility                                                             |
| -------------------- | -------------------------------------------------------------------------- |
| `paths.mjs`          | Repo-root-relative paths, resolved from `import.meta.url`.                  |
| `json.mjs`           | Read/parse with the path in the error; write 2-space JSON only when changed. |
| `tsv.mjs`            | **Reference** TSV parser/serializer for word banks.                         |
| `markup.mjs`         | **Reference** inline-markup parser and `stripFormatting`.                    |
| `slug.mjs`           | Word-id rules.                                                              |
| `library.mjs`        | Loads `library.json` and banks; derives bank paths; revision hashing.        |
| `build-manifest.mjs` | Generates `manifest.json`.                                                  |
| `validate.mjs`       | Enforces the seven invariants.                                              |
| `migrate-v1-to-v2.mjs` | The schema 1 -> 2 migration, kept for auditability.                        |

`tsv.mjs` and `markup.mjs` are marked *reference* because the frontend data layer
and the audio generator each carry their own implementation of the same two
formats. Their doc comments spell out every edge case; treat those comments as
part of the contract and change all three together.

## TSV rules worth remembering

- Columns are addressed **by header name**. Reordering is free; unknown columns
  are ignored, so a new column needs no schema bump.
- Required: `id`, `front`, `back`. Optional: `tags` (comma-separated in one cell,
  each tag trimmed).
- No field may contain a tab or a newline — there is no escape syntax, and both
  the parser and the serializer refuse rather than invent one.
- Blank lines and lines whose first non-space character is `#` are skipped, so a
  bank can be commented and grouped. A line of only tabs counts as blank.
- Field values are **not** trimmed (a trailing space in `front` would change the
  audio key); header cells and individual tags are.
- **A row may omit trailing optional columns.** `ik⇥ik⇥I` is valid and means no
  tags, exactly as `ik⇥ik⇥I⇥` does — forgetting the final tab is the likeliest
  hand-edit slip there is, and it is unambiguous. Omitting a *required* column is
  an error, and so is a row with **more** fields than the header (that is what an
  embedded tab looks like). Trailing empty extras are forgiven, being the mirror
  image of the omitted trailing tab.

`parseTsv(text, { requiredColumns })` applies that policy; with no
`requiredColumns` it is fully lenient, so a generic reader parses anything a
validator would accept. Each row also reports `missing`, the trailing columns the
line stopped short of.

## `library.json` fields

`id`, `name`, `color` (`#RRGGBB`) and `languages.{front,back}.{label,locale}` are
required. That is the whole list.

There is **no `bank` path field**. A deck's words are always at `banks/<id>.tsv`,
derived from the id by `bankRelativePath()` in `library.mjs`, which is the only
place that convention is written down. An explicit field pinned to that exact
value carried no information — it was `id` spelled twice, a field that could only
ever be right or wrong and never informative. Deriving it also makes the orphan
sweep over `banks/` total: a deck cannot point somewhere the sweep does not look.
A leftover `bank` line is reported as an error telling you to delete it.

`icon` is **optional**: a name from the frontend's curated set
(`frontend/src/features/decks/deck-icon.tsx`), copied through to the manifest
when present and omitted entirely when absent. `validate` checks only that it is
a non-empty string — the list of valid names lives in the frontend, and an
unrecognized name renders the fallback icon rather than failing CI. Duplicating
that list here is exactly the cross-tool duplication schema 2 exists to remove.

## Inline formatting

`front` and `back` may use `**bold**`, `*italic*`, `__underline__`, with `\*`,
`\_`, `\\` escapes and free nesting. Everything else is literal text.

`stripFormatting()` is what audio clips are keyed on
(`${locale}:${strippedText}`), so it must be reproducible character for
character. Three deliberate deviations from markdown, all documented in
`markup.mjs`:

- A lone `_` is never a delimiter (only `__` is).
- There are no flanking rules: `a * b * c` really does italicise " b ".
- **Matching is by whole token**, longest first (`**`, `__`, `*`), and a token
  never splits across a run of delimiter characters. A leftover delimiter is
  literal text *outside* the element, not inside it: `***x***` is the text `**`
  followed by `<em>x**</em>`, stripping to `**x**`. Empty emphasis is resolved
  first, which is why `____x____` stays entirely literal. There is no
  bold-italic shorthand — nest explicitly: `**a *b* c**`.

This is not CommonMark's delimiter-run algorithm, which would pull the leftover
*inside* the element. Whole-token matching is the rule three implementations can
reproduce, which matters more here than being principled about text nobody
writes: `stripFormatting` is differentially fuzzed against
`tools/audio-gen/src/format.mjs` and `frontend/src/lib/markup/strip.ts`, and that
corpus must show **zero** mismatches or audio clips silently orphan.

An unbalanced delimiter is **never an error** — it renders literally, and
`validate` reports it as a warning, as it does a run of 3+ delimiters. Data must
not be able to break a card.

## Word ids

`src/slug.mjs` is the single implementation: lowercase `front`, every run outside
`[a-z0-9]` collapsed to one `-`, trimmed, empty falling back to `word`, and `-2`,
`-3`, … on collision.

Word ids are the keys learner progress is stored under. **Never renumber or
reassign an existing id** — that silently wipes a learner's progress on that
word. `validate` therefore accepts any `-N` (N >= 2) suffix on the correct base
slug rather than demanding the numbering a fresh pass would produce, so
reordering or inserting words never forces id churn. Because `id` is now an
explicit column, any change to one is visible in review.

## What the manifest carries, and why

A manifest entry is `{id, name, color, icon?, languages, wordCount, revision}`,
and the file is `{schemaVersion, decks}`. Nothing else.

The manifest exists so the overview grid renders **without fetching a single
bank**, so a field earns its place only if the grid needs it before a deck is
loaded. `wordCount` qualifies: the grid shows a word count and a progress
percentage per deck, and recomputing those would mean fetching every bank on the
home screen. Being derived is not what disqualifies a field — being derived *and
unneeded* is. Three fields failed that test and are gone:

- **`tags`** — the only screen that filters by tag is a deck's own page, which
  fetches that deck's bank anyway and counts tags from the words in hand.
- **a top-level aggregate `revision`** — no consumer. Freshness is decided per
  deck, so an all-decks hash was a value nothing read.
- **`bank`** — the id spelled twice; see above.

`decks[].revision` is the first 12 hex of `sha256` of the bank file's exact bytes.
Whitespace the parser ignores still changes it; a cheap false cache invalidation
beats a missed one. Edit a bank and the frontend's query key changes, the deck
refetches, the old entry is collected — nobody has to bump anything.

No timestamps anywhere, so regenerating without an input change produces a
byte-identical file — which is what makes invariant 6 (and the CI check) mean
anything. Because that check is a **byte** comparison, the serialization is part
of the contract: `JSON.stringify(value, null, 2)` plus a trailing newline, keys in
the order the contract lists, deck order following `library.json`.

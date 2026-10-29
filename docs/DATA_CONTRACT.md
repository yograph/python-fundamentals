# Data contract (schema 2)

Everything the frontend renders comes from static files under `data/`, published
alongside the site. This file is the single source of truth for their shape. The
frontend, the validator and the audio generator all encode this contract, so a
change here is a change in three places.

## The split that matters

There are two kinds of file here, and conflating them was the main flaw in
schema 1:

- **Authored** — what a human or an AI edits. `library.json` and the `.tsv` word
  banks. Nothing in them is derived, so nothing in them can go stale.
- **Generated** — what the app consumes. `manifest.json` and `audio/index.json`,
  both produced by `tools/`. Committed (the site serves them statically) but
  never hand-edited.

Schema 1 duplicated `wordCount` and `tags` between the manifest and the deck
file, and needed a validator rule to police the duplication. Now they are derived
and the duplication cannot drift.

```
data/
├── library.json             # AUTHORED  deck + exercise-set metadata, the single source
├── banks/
│   └── <deckId>.tsv         # AUTHORED  one word per line
├── exercises/
│   └── <setId>.json         # AUTHORED  one exercise set (grammar/translation/writing),
│                            #           grammar sets optionally with course lessons
├── manifest.json            # GENERATED library + banks + sets, with derived fields
└── audio/
    ├── index.json           # GENERATED spoken-text -> clip lookup
    └── <locale>/<sha1>.ogg  # Opus-in-Ogg, mono, speech-tuned bitrate
```

`data/` is copied to `dist/data` at build time (`frontend/scripts/postbuild.mjs`),
so in production these live at `https://yograph.github.io/python-fundamentals/data/...` and in
dev at `http://localhost:3000/data/...`. The frontend resolves the base from
`import.meta.env.VITE_DATA_BASE_URL`, defaulting to `/data`.

## `library.json` (authored)

```json
{
  "schemaVersion": 2,
  "decks": [
    {
      "id": "dutch-1",
      "name": "Dutch",
      "color": "#FF4F00",
      "icon": "languages",
      "languages": {
        "front": { "label": "Dutch", "locale": "nl-NL" },
        "back": { "label": "English", "locale": "en-US" }
      }
    }
  ]
}
```

- `id` — must equal the bank's filename stem.
- `color` — `#RRGGBB`.
- `icon` — **optional.** A name from the frontend's curated icon set
  (`frontend/src/features/decks/deck-icon.tsx`), shown on the deck tile. The set
  of valid names lives in the frontend and is deliberately **not** enforced here:
  an unrecognized name renders the fallback icon, so a typo costs a deck its icon
  rather than failing validation or breaking a tile. Omit it to get the default.
- `locale` — BCP-47. Drives text-to-speech voice selection, so it must be real.

No `revision`, no `wordCount`, no `tags`: all three are derived.

There is also no `bank` path field. A deck's words live at `banks/<id>.tsv`,
derived from `id` wherever the path is needed. An explicit field pinned to that
exact value carried no information and could only ever be wrong.

### `exerciseSets` (optional)

`library.json` may also list exercise sets — grammar questions, translations
and writing prompts — under a top-level `exerciseSets` array:

```json
{
  "exerciseSets": [
    {
      "id": "grammar-a1",
      "name": "Grammar A1",
      "kind": "grammar",
      "level": "A1",
      "color": "#D97706",
      "icon": "graduation-cap"
    }
  ]
}
```

- `id` — lowercase slug; must equal the set file's stem (`exercises/<id>.json`,
  derived, never authored as a path — same reasoning as banks).
- `kind` — `grammar`, `translation` or `writing`. Decides the shape of the
  set's items and which practice UI runs them.
- `level` — **optional** free-text label ("A1"), shown as a subtitle.
- `course` — **optional** plain-text course name ("Python fundamentals").
  Sets naming the same course get their own overview section under that
  heading, in library order: sets with lessons as course levels, sets without
  as that course's quizzes. Sets without a `course` stay where they always
  were (the Grammar course section or Practice).
- `color`, `icon` — as for decks.

No `exerciseCount`, no `revision`: both derived, exactly like a deck's
`wordCount`/`revision`.

## `exercises/<setId>.json` (authored)

```json
{
  "schemaVersion": 2,
  "exercises": [
    {
      "id": "ik-naar-school",
      "prompt": "Ik ___ naar school.",
      "choices": ["ga", "gaat", "gaan", "gaas"],
      "answerIndex": 0,
      "explanation": "First person singular takes the verb stem: ik ga.",
      "tags": ["present-tense"]
    }
  ]
}
```

Item shape depends on the set's `kind` (which lives in `library.json` only, so
it cannot drift):

- **grammar** — `id`, `prompt`, `choices` (2+ distinct options, exactly one
  correct), `answerIndex` (0-based, must index into `choices`), `explanation`,
  `tags`. Optionally `code`, a snippet shown verbatim in a monospace box under
  the prompt, and `codeChoices: true` when every choice is code or program
  output (monospace, line breaks kept). Neither is ever parsed as markup.
- **translation** — `id`, `source`, `reference`, `direction` (`nl-en` when the
  source is Dutch, `en-nl` when it is English), `tags`.
- **writing** — `id`, `prompt`, `instructions`, `example` (a model answer,
  may contain newlines), `tags`.

Rules shared by every kind:

- `id` is a **stable, unique-within-the-set** lowercase slug, and the key the
  learner's progress is stored under. Unlike word ids it is not derived from
  any text field — exercises get reworded in place. **Never reassign one.**
- `tags` may be empty but must be present.
- Exercise text renders as **plain text**: the inline-markdown subset that
  cards support does not apply here, and markup-looking text draws a validator
  warning.

### Grammar lessons (optional, grammar sets only)

A grammar set file may also carry `lessons`, which turns the set into one
level of the grammar course: the app then lists it under **Grammar course**,
with a page per lesson, instead of as a bare quiz.

```json
{
  "schemaVersion": 2,
  "lessons": [
    {
      "id": "word-order-v2",
      "title": "Word order: the verb in second place",
      "summary": "Put the finite verb second in every main clause.",
      "blocks": [
        { "type": "rule", "text": "The finite verb is always the **second** element." },
        {
          "type": "examples",
          "items": [
            { "nl": "Morgen **ga** ik naar Utrecht.", "en": "Tomorrow I'm going to Utrecht." }
          ]
        }
      ]
    }
  ],
  "exercises": [
    { "id": "morgen-ga-ik-naar-school", "tags": ["word-order-v2"], "…": "…" }
  ]
}
```

- `id` — lowercase slug, unique within the set. It is the lesson's URL
  segment and the tag that links exercises to it. Like exercise ids, never
  reassign one.
- `title`, `summary` — plain text. `summary` is one sentence.
- `blocks` — the lesson body, in reading order. One of:

  | `type`     | Fields                                               |
  | ---------- | ---------------------------------------------------- |
  | `heading`  | `text`                                               |
  | `text`     | `text`                                               |
  | `rule`     | `text` — the core rule, shown in a highlighted box    |
  | `tip`      | `text`                                               |
  | `list`     | `items` (strings)                                    |
  | `table`    | `headers` (strings), `rows` (string arrays, one cell per header), optional `caption` |
  | `examples` | `items`: `{ "nl", "en", "note"? }` — `nl` is voiced in Dutch |
  | `mistake`  | `wrong`, `right`, `why`                              |
  | `code`     | `code`, optional `caption`, optional `output` (what the code prints) |
  | `bug`      | `wrong`, `right` (both code), `why` — a coding mistake and its fix |

  Unlike exercise text, every string inside a block may carry the card markup
  subset (`**bold**`, `*italic*`, `__underline__`), with the same rules as
  card text: it is parsed into React elements, never HTML, and unbalanced
  markup renders literally. The exception is code: `code`, `output`, and a
  `bug` block's `wrong` and `right` are shown verbatim in monospace and never
  parsed, since `*` and `__` are ordinary Python. A literal `*` or `__` in any
  other lesson text must be escaped (`\*`, `\_\_`).
- **Every exercise in a set with lessons names exactly one lesson id in its
  `tags`**, and every lesson has at least one exercise. A lesson's practice
  round is the set's exercises carrying its id, and its progress is the same
  per-exercise progress the whole set uses — there is no separate lesson
  progress to drift.

### Coding labs (optional, grammar sets with lessons only)

A set file with lessons may also carry `labs`: small programs the learner
types and runs in the browser, each growing over a few steps while the support
fades.

```json
{
  "labs": [
    {
      "id": "shopping-list",
      "lesson": "for-loops",
      "title": "Print a shopping list",
      "summary": "Walk through a list with a for loop, then bend the loop.",
      "steps": [
        {
          "id": "type-it",
          "mode": "guided",
          "title": "Type your first for loop",
          "instructions": "Type this program exactly, piece by piece.",
          "guide": [
            { "code": "items = [\"milk\", \"eggs\"]", "explain": "Make a list." },
            { "code": "for item in items:\n    print(item)", "explain": "Loop over it." }
          ],
          "solution": "items = [\"milk\", \"eggs\"]\nfor item in items:\n    print(item)",
          "tests": [
            {
              "name": "prints each item",
              "code": "assert LINES == ['milk', 'eggs']",
              "fail": "Print milk and eggs, each on its own line."
            }
          ]
        }
      ]
    }
  ]
}
```

- `id` — lowercase slug, unique within the set; the lab's URL segment.
- `lesson` — the id of the lesson in this set the lab practises.
- `title`, `summary` — plain text.
- `steps` — in order. Each step:
  - `id` — slug, unique within the lab; with the lab id, the progress key.
  - `mode` — `guided` (the whole program, in `guide` pieces), `change` (alter
    the previous program or a starter), `write` (on your own) or `challenge`.
  - `title` plain; `instructions`, every `guide[].explain` and every `hints[]`
    entry are rich text, with the lesson markup rules.
  - `guide` — guided steps only: `{code, explain}` pieces that, joined with
    newlines, are exactly `solution`.
  - `starter` — the editor's code when the step opens; or `carryOver: true`
    (not on the first step, not with `starter`) to open with the learner's
    code from the previous step.
  - `inputs` — typed input, one string per `input()` call, for Run and as
    the tests' default.
  - `solution` — a program that passes every test.
  - `tests` — `{name, code, fail, inputs?}`. Each test runs the learner's
    program afresh, then `code` in its namespace, and passes when `code`
    raises nothing. `name` and `fail` are plain text.
    `frontend/src/lib/python/harness.py` documents what else is in scope
    (`OUT`, `LINES`, `SOURCE`, `uses`, `calls`, `defines`, `is_recursive`,
    `output_of`, `run_source`).

The validator checks the shape (invariant 10). Whether every solution passes
its tests, and no step is already solved when it opens, is proven by running
them: `tools/course-check/check_labs.py`, through the same harness the browser
uses.

## Manifest `exerciseSets` (generated)

When the library lists exercise sets, the manifest carries them after `decks`,
each entry being the authored fields (`id`, `name`, `kind`, `level`,
`course`, `color`, `icon`, in that order, optional ones only when authored)
plus derived `exerciseCount`,
`lessonCount` (only for a grammar set whose file carries lessons — absent
otherwise, so a set without lessons keeps its exact bytes), `labCount` (likewise,
only when the file carries labs) and `revision` (first 12 hex of sha256 of the set file's exact bytes — the cache
key, same mechanism as decks). When the library lists none, the key is absent
entirely, so a library without sets produces byte-identical output to one
predating the field.

## `banks/<deckId>.tsv` (authored)

Tab-separated, one word per line, with a header row.

```tsv
id	front	back	tags
ik	ik	I	introduction
de-man	de man	the man	introduction
alsjeblieft	alsjeblieft (a.u.b.)	please	l1,politeness
hoe-gaat-het	Hoe gaat het?	How are you?	introduction,question
```

Tabs rather than commas because commas occur constantly in this content
(`alsjeblieft (a.u.b.)`, tag lists, glosses like "well, fine") while tabs never
do. That removes quoting and escaping entirely: a line is `split("\t")`, and
there is no quoted-field mode to get wrong.

Rules:

- **Columns are addressed by header name, not position.** Reordering columns is
  allowed; unknown columns are ignored, which is what lets a future column be
  added without a schema bump.
- Required columns: `id`, `front`, `back`. Optional: `tags`.
- `tags` is comma-separated inside the one cell; empty cell means no tags.
  Whitespace around each tag is trimmed.
- **No field may contain a tab or a newline.** The validator rejects it rather
  than inventing an escape syntax.
- Blank lines and lines whose first non-space character is `#` are skipped, so a
  bank can carry comments and be grouped visually.
- **A row may omit trailing optional columns.** `ik⇥ik⇥I` is valid and means no
  tags, exactly as `ik⇥ik⇥I⇥` does. Forgetting the final tab on a word with no
  tags is the single likeliest hand-edit slip, and it is unambiguous, so it is
  accepted rather than failed.
- A row missing a **required** column is an error, and so is a row with more
  fields than the header — that is a stray tab, which means the data is not
  saying what it looks like it says.

### Word ids

`id` is **stable, unique within the bank**, and the key user progress is stored
under. Generated as a slug of `front` (lowercase, every run outside `[a-z0-9]`
collapsed to a single `-`, trimmed, empty falling back to `word`), with `-2`,
`-3`, … appended on collision.

It is slugified `front` specifically so that progress saved by the original
Firestore-backed version — which keyed progress on the raw `front` string —
remains recoverable.

**Never renumber or reassign an existing id.** That silently resets a learner's
progress on that word. Because ids are now an explicit column rather than
something derived at load time, this is visible in review, which is the point.

### Inline formatting

`front` and `back` may carry a deliberately tiny inline-markdown subset. `id`,
`tags` and every field in `library.json` are always plain text.

| Markup          | Renders as |
| --------------- | ---------- |
| `**bold**`      | `<strong>` |
| `*italic*`      | `<em>`     |
| `__underline__` | `<u>`      |

- Delimiters may nest (`**a *b* c**`) but must be balanced.
- `\*`, `\_` and `\\` are literal escapes.
- **An unbalanced or unrecognized delimiter renders as literal text, never an
  error.** Data must not be able to break a card.
- There is no HTML, no links, no code spans, no block-level anything. Markup is
  parsed into React elements and never passed to `innerHTML`, so there is no
  injection surface even though a workflow can write these files.

Because three separate implementations must agree, "it degrades gracefully" is
not a precise enough instruction. The exact behaviour, verified identical across
all three:

- Delimiters are matched as **whole tokens**, longest first (`**`, then `__`,
  then `*`), and a token never splits across a run of delimiter characters.
- **Empty emphasis is literal, and this rule is applied first.** A delimiter
  immediately followed by its own closing token has nothing to wrap, so both
  become text: `****` → `****`. This is also why `____x____` is left *entirely*
  literal — the leading `__` pairs with the `__` right after it around nothing,
  so no underline is produced anywhere on the line.
- **A leftover delimiter is literal text outside the element, not inside it.**
  `***x***` parses to the text `**` followed by `<em>x**</em>`, and strips to
  `**x**`. Note that the leading asterisks render un-italicised, since they are
  siblings of the emphasis rather than children.

| Input         | Renders as                 | Strips to  |
| ------------- | -------------------------- | ---------- |
| `**a *b* c**` | `<strong>a <em>b</em> c</strong>` | `a b c`    |
| `***x***`     | `**` + `<em>x**</em>`      | `**x**`    |
| `****`        | `****`                     | `****`     |
| `____x____`   | `____x____`                | `____x____`|
| `un**balanced`| `un**balanced`             | `un**balanced` |

There is deliberately no bold-italic shorthand. To get both, nest explicitly:
`**a *b* c**`.

**Formatting is stripped before text-to-speech, and the stripped text is what
audio is keyed on.** So italicising a word does not orphan its clip and does not
trigger regeneration. Any tool touching audio applies the same strip: remove
delimiters, resolve escapes, leave everything else alone.

## `manifest.json` (generated)

Regenerate with `pnpm data:manifest`. Fetched on every app start
(`cache: "no-store"`); it is what tells a browser its cached decks are stale.

```json
{
  "schemaVersion": 2,
  "decks": [
    {
      "id": "dutch-1",
      "name": "Dutch",
      "color": "#FF4F00",
      "languages": {
        "front": { "label": "Dutch", "locale": "nl-NL" },
        "back": { "label": "English", "locale": "en-US" }
      },
      "wordCount": 127,
      "revision": "3ab8f10c92d4"
    }
  ]
}
```

- `revision` — first 12 hex of `sha256` of the bank file's **exact bytes**. This
  is the deck cache key: edit a bank, the hash changes, the frontend's query key
  changes, the deck refetches, the old entry is collected. Nobody has to remember
  to bump anything.
- `wordCount` — derived from the bank.
- Everything else is copied verbatim from `library.json`.

Nothing else belongs here, and two fields were removed once that test was applied
honestly. The manifest's job is to let the **overview** render without fetching a
single bank, so a field earns its place only if the grid needs it before a deck is
loaded:

- A denormalized `tags` list was dropped. The only screen that filters by tag is
  a deck's own page, which fetches that deck's bank anyway and can count tags from
  the words in hand.
- An aggregate top-level `revision` was dropped. It had no consumer: freshness is
  decided per deck, so an all-decks hash was a value nothing ever read.
- A `bank` path was dropped, for the reason given under `library.json`.

`wordCount` is derived and stays, which is not a contradiction: being derived is
not what disqualifies a field, being derived *and unneeded* is. The grid shows a
word count and a progress percentage for every deck, and recomputing those would
mean fetching every bank on the home screen — exactly what this file exists to
avoid.

**The manifest is a pure function of the authored files.** There is no
`generatedAt` and no timestamp anywhere, so regenerating without changing content
produces a byte-identical file. CI can therefore assert the committed manifest is
exactly what the current inputs produce — a check that is meaningless if the
output contains a clock.

Because invariant 6 is a **byte** comparison, the serialization is part of the
contract, not an implementation detail: every generated JSON file here is
`JSON.stringify(value, null, 2)` followed by a single trailing newline, with
object keys in the order this document lists them (and `clips` sorted by key).
Deck order in `decks[]` follows `library.json`'s authored order, which is also the
display order; only the hash input is sorted.

## `audio/index.json` (generated)

```json
{
  "schemaVersion": 2,
  "voices": { "nl-NL": "Kore", "en-US": "Kore" },
  "clips": {
    "nl-NL:ik": { "path": "audio/nl-NL/8f2b1c9e4a.ogg", "bytes": 3412 }
  }
}
```

- Clip key is `` `${locale}:${strippedText}` `` — formatting removed, per above.
  Shared across decks, so a word appearing in two decks is voiced once.
- Filename stem is `sha1(key)` truncated to 10 hex chars. The hash makes
  generation idempotent: a key present in `clips` with a file on disk is skipped,
  and a deleted file is regenerated.
- No timestamps, for the same reproducibility reason as the manifest.
- Audio is Opus in Ogg: mono, 24 kHz input, ~16 kbps VBR, so a few KB per word.
  (Ogg Opus always advertises 48 kHz in its header regardless; that is inherent
  to the codec, not a mis-encode.)

## Invariants the validator enforces

1. Every `library.decks[]` entry has a bank file at `banks/<id>.tsv`, and every
   file in `banks/` is claimed by exactly one entry — no orphans, no dangles.
   With the path derived from the id, this is now one rule rather than two.
2. Deck ids are unique within `library.json`.
3. Every bank has the required columns; no field contains a tab or newline; no
   row omits a required column or carries more fields than the header. Omitting
   trailing optional columns is allowed.
4. Word ids are unique within a bank and match the slug rules (a `-N` suffix on
   the correct base slug is accepted, since ids are stable and must not be
   renumbered on reorder).
5. Inline formatting in `front`/`back` parses with balanced delimiters. Unbalanced
   markup is a **warning**, not an error — it still renders as literal text, so it
   is a likely typo rather than corruption.
6. `manifest.json` is byte-identical to a fresh regeneration from `library.json`,
   the banks and the exercise sets.
7. Every `audio/index.json` clip path exists on disk with the recorded byte size;
   every clip key's locale is used by some deck; and no clip key contains
   formatting markup (it must be stripped text).
8. Every `library.exerciseSets[]` entry has a valid file at
   `exercises/<id>.json` (schema version, item shape per kind, unique slug ids,
   `answerIndex` in range), and every file in `exercises/` is claimed by
   exactly one entry.
9. A set file's `lessons`, when present, belong to a grammar set; lesson ids
   are unique slugs; every block has a known type and its required fields;
   every table row has one cell per header; every exercise names exactly one
   lesson id in its tags; and every lesson has at least one exercise.
10. A set file's `labs`, when present, belong to a grammar set with lessons;
    lab ids are unique slugs naming one of the set's lessons; every step has a
    unique slug id, a known mode, a title, instructions, a solution and at
    least one well-formed test; a guide adds up to its solution; and
    `carryOver` is never on a first step or alongside a `starter`.

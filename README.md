# Python fundamentals

Lessons and quizzes for an intro to programming in Python, living at
**[yograph.github.io/python-fundamentals](https://yograph.github.io/python-fundamentals/)**.

The course is built for memorising **how** to code: what each construct does
for you, what is allowed and what is not, and how to tell a correct
implementation from a wrong one. It runs from values and types up to the
recursion an intro course ends with: searching mazes and generating
combinations.

| Set | Lessons |
| --- | --- |
| **Python 1: Basics** | values and types, variables, `input()` and `print()`, arithmetic, strings, conditions, reading error messages |
| **Python 2: Loops & lists** | while loops, for loops, `range()`, lists, loop patterns, nested loops and grids, what works with what |
| **Python 3: Functions & recursion** | functions, scope and lists, recursion basics, recursion on strings and lists, tracing recursion, mazes, combinations |
| **Correct or wrong?** | 48 implementations to judge, across every topic |

Each lesson starts with the one rule to memorise, shows runnable examples with
their output, and puts each common mistake next to its fix. Its exercises mix
"what is this for?", "what does this print?", "is this implementation
correct?" and fill-in-the-gap questions. Progress is saved in the browser, and
questions answered wrong come back first next round.

## Every answer key is run, not trusted

`tools/course-check/check_course.py` runs the code behind every question with
Python and fails if an answer key disagrees:

- **"What does this print?"**: the code is run, and the marked answer must be
  exactly its output (or name the error it raises, or say it never stops).
- **"Is this implementation correct?"**: the code is run against the tests in
  `tools/course-check/checks/<setId>.json`; the verdict must match.
- **Fill-in and fix questions**: the right choice must pass its test and every
  other choice must fail it, so no question has two right answers.
- **Lesson examples** with an `output` are run and compared too.

```bash
pnpm course:check
```

CI runs it on every push, next to the data validator.

## Editing the course

The content is plain JSON in `data/exercises/<setId>.json`, described in
[`docs/DATA_CONTRACT.md`](docs/DATA_CONTRACT.md). Lessons are lists of blocks
(`rule`, `text`, `code`, `bug`, `table`, `tip`, …); questions are multiple
choice, with optional `code` shown in a monospace box. After an edit:

```bash
pnpm data:manifest   # rebuild data/manifest.json
pnpm data:validate   # check data/ against the contract
pnpm course:check    # run every answer key
```

A new question set goes in `data/library.json` under `exerciseSets` with
`"course": "Python fundamentals"`.

## Running it

Requires Node 20+ and [pnpm](https://pnpm.io) (`corepack enable` is enough),
plus Python 3 for `course:check`.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Command              | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `pnpm dev`           | Frontend dev server                                    |
| `pnpm build`         | Type-check, build to `frontend/dist`, copy `data/` in  |
| `pnpm check`         | Biome: format, lint and organize imports, with fixes   |
| `pnpm typecheck`     | `tsc --noEmit`                                         |
| `pnpm data:validate` | Check `data/` against the contract                     |
| `pnpm data:manifest` | Rebuild `data/manifest.json`                           |
| `pnpm course:check`  | Run every answer key with Python                       |

## Deploying

Pushing to `main` runs the Deploy workflow, which validates the data, builds
the site and publishes it to GitHub Pages.

## Where this comes from

The app is a copy of a flashcards and practice app
([nomomon/flashcards](https://github.com/nomomon/flashcards), MIT), which is
why the code also supports flashcard decks with spoken audio, translation and
writing exercises. This repo uses only its lessons and multiple-choice quizzes,
extended with code blocks and code answers. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the frontend is layered.

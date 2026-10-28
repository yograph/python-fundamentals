# @flashcards/audio-gen

Generates the spoken audio for every word in every deck: Gemini text-to-speech
in, Opus-in-Ogg files under `data/audio/` plus a lookup table at
`data/audio/index.json` out. Zero npm dependencies: plain `.mjs` on Node >= 20
built-ins, `fetch`, and `ffmpeg` on `PATH`.

The file layout and the index shape are fixed by
[`docs/DATA_CONTRACT.md`](../../docs/DATA_CONTRACT.md); this package is one of
the three places that encode that contract.

## What it reads

Schema 2, so there are two inputs:

- `data/manifest.json` — the deck list. Each entry supplies the deck's `id`,
  its `languages.front`/`languages.back` (label plus locale) and a `bank` path.
- `data/banks/<deckId>.tsv` — the words, tab-separated with a header row.

Columns are addressed **by header name** (`id`, `front`, `back`, `tags`), so
reordering them is fine and unknown columns are ignored. Blank lines and `#`
comment lines are skipped. A row may omit trailing *optional* columns, so
`ik⇥ik⇥I` and `ik⇥ik⇥I⇥` both mean "no tags"; omitting a required column, or
having more fields than the header (a stray tab), is an error that names the
line. The reader is ~50 lines in `src/tsv.mjs`: since the contract forbids a tab
or a newline inside any field, a line is `split("\t")` and there is no
quoted-field mode to get wrong. It is a deliberate re-implementation rather than
an import from `tools/data-tools`, because this package has no workspace
dependencies.

A schema-1 manifest, or a schema-2 entry still carrying a schema-1 `path`, stops
the run with a message telling you to regenerate rather than being guessed at.

## What it does

For every word it needs two clips: the `front` text spoken in the deck's
`languages.front.locale`, and the `back` text in `languages.back.locale`. Clips
are deduplicated across all decks by the `` `${locale}:${strippedText}` `` key,
so a word that appears in three decks is voiced once. The filename is
`sha1(key)` truncated to 10 hex characters, which is what makes the whole thing
idempotent.

Runs are **incremental**. A clip is generated only when:

- its key is absent from `data/audio/index.json`, or
- its file is missing from disk, or
- `--force` was passed.

So adding words to a deck generates only the new words, and deleting
`data/audio/` entirely and rerunning repopulates everything from scratch.

## Formatting is stripped before TTS

`front` and `back` may carry the tiny inline-markdown subset from the data
contract: `**bold**`, `*italic*`, `__underline__`, with `\*` `\_` `\\` escapes.
None of it is spoken. `src/format.mjs` strips it, and the stripped text is used
for **both** things that matter:

- the text sent to Gemini — the model would otherwise try to pronounce the
  asterisks, or read them as emphasis cues;
- the clip key, and therefore the filename.

So **changing formatting does not regenerate audio.** Editing `de man` to
`de **man**` leaves the key `nl-NL:de man` untouched: the existing clip is not
orphaned, nothing is pruned, and the run reports zero to generate. The same
applies in reverse and to purely cosmetic churn of any kind. Only a change to the
*words* costs an API call.

Unbalanced markup is literal text, never an error — `2 * 3` is spoken as "2 * 3"
and keyed that way, because data must not be able to break a card.
`tools/data-tools/src/markup.mjs` is the reference implementation of this subset;
`src/format.mjs` mirrors it rule for rule and must stay byte-for-byte identical
to it. If you change one, change both.

Clips whose text no longer appears in any deck are pruned, file and index entry
together, but only after a run that generated everything it set out to generate.
A partial failure, a `--deck` filter, or a `--limit` cap all suppress pruning, so
a bad run can never delete good audio.

## Getting an API key

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and create an API
   key.
2. Export it locally:

   ```sh
   export GEMINI_API_KEY=...
   ```

3. For CI, add it as the repository secret `GEMINI_API_KEY` (Settings → Secrets
   and variables → Actions). The `audio.yml` workflow skips itself with a warning
   rather than failing when the secret is absent.

The key is only ever sent in the `x-goog-api-key` request header, never in a URL
and never logged.

## Running it

```sh
# See the plan without spending anything. No API key needed.
node tools/audio-gen/src/generate.mjs --dry-run

# Generate what is missing.
node tools/audio-gen/src/generate.mjs

# From this workspace
pnpm --filter @flashcards/audio-gen run generate
```

`ffmpeg` must be on `PATH` (`brew install ffmpeg` /
`sudo apt-get install -y ffmpeg`); the run stops with that message before making
any API call if it is missing.

### Flags

| Flag                | Effect                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| `--dry-run`         | Print exactly what would be generated and pruned. Zero API calls, zero writes. |
| `--force`           | Regenerate every clip, ignoring the index.                                  |
| `--deck <id>`       | Restrict to one deck (manifest id). Suppresses pruning.                     |
| `--locales <a,b>`   | Only these locales, comma separated. Suppresses pruning.                     |
| `--limit <n>`       | Stop after generating `n` clips. Suppresses pruning. Good for a first smoke test. |
| `--concurrency <n>` | Clips in flight at once. Default 2, capped at 4.                            |
| `-h`, `--help`      | Usage.                                                                      |

A first careful run on a fresh deck:

```sh
node tools/audio-gen/src/generate.mjs --dry-run       # what am I about to do
node tools/audio-gen/src/generate.mjs --limit 5       # listen to five clips
node tools/audio-gen/src/generate.mjs                 # the rest
```

### Generating only the language you study

A deck has two sides, and the back side is usually the learner's own language.
For the Dutch/English deck that is 242 clips, of which 118 are English
pronunciation nobody is going to play:

```sh
node tools/audio-gen/src/generate.mjs --locales nl-NL
```

That roughly halves both the API cost and the bytes committed to the repo, and
it is the right choice if you never study back-to-front. Study sessions can run
back-to-front, though, in which case English is the prompt side and wants audio
too; then generate both:

```sh
node tools/audio-gen/src/generate.mjs --locales nl-NL,en-US   # same as omitting it
```

`--locales` never deletes anything. Clips outside the allowlist keep their files
and their index entries, because the flag also switches pruning off: with a
filtered view of the desired set, the pruner would read "not in scope" as
"delete". A locale no deck uses (a typo like `nl_NL`) fails the run rather than
quietly planning zero clips.

### Forcing a full repopulate

Either of these regenerates everything:

```sh
node tools/audio-gen/src/generate.mjs --force
# or, equivalently, throw the audio away and rebuild
rm -rf data/audio && node tools/audio-gen/src/generate.mjs
```

Both cost a full API call per clip. On CI, run the **Audio** workflow with
`force: true`.

## Voices

`voices.json` maps a locale to a Gemini prebuilt voice:

```json
{
  "nl-NL": "Kore",
  "en-US": "Kore"
}
```

Lookup is exact locale first (`nl-NL`), then the bare language (`nl`), then the
default `Kore`, so one entry can cover every region of a language. The file is
optional; without it everything uses `Kore`.

The voice actually used per locale is recorded in the index's `voices` map.
Changing a voice does **not** invalidate existing clips; rerun with `--force`
(or delete that locale's directory) so the recorded voice and the audio on disk
cannot drift apart.

## Cost and rate limits

Every generated clip is one `gemini-2.5-flash-preview-tts` request, so a
250-word deck is ~500 requests on first population and ~0 thereafter. That is
why the index exists and why the default concurrency is 2.

- 429 and 5xx responses are retried with exponential backoff (1s, 2s, 4s, …
  capped at 30s, 5 attempts), honouring `Retry-After` when present.
- Free-tier quotas on preview models are low and change without notice. If you
  hit a wall of 429s, let the backoff work or split the job with `--limit`.
- Any clip that ultimately fails makes the run exit non-zero, and pruning is
  skipped for that run.

Clips land at roughly 1 to 5 KB each (mono, ~16 kbps VBR, `-application voip`), so
a few thousand words stay comfortably inside a GitHub Pages deployment.

## Notes for the next person

- **The Gemini response is headerless PCM.** `inlineData.data` is base64 raw
  signed 16-bit little-endian mono PCM with no WAV header, and the sample rate
  only appears in `inlineData.mimeType`
  (`audio/L16;codec=pcm;rate=24000`). It is parsed from there rather than
  assumed, and handed to ffmpeg as `-f s16le -ar <rate> -ac 1`. Feeding it to
  ffmpeg without `-f s16le` produces either an error or noise.
- **`ffprobe` reports 48000 Hz on the output.** That is normal: an Ogg Opus
  stream always advertises 48 kHz regardless of the encoder's internal rate.
  `-ar 24000` still does its job of narrowing the encoded band.
- **`data/audio/index.json` carries no timestamps.** Schema 2 dropped
  `generatedAt`, top-level and per-clip, so the file is a pure function of the
  clips that exist: rewriting it unchanged produces byte-identical output, and CI
  can assert the committed index is exactly what the current inputs produce. A
  check like that is meaningless once the output contains a clock. Keys are
  sorted, the indent is 2 spaces, and there is a trailing newline.
- It is rewritten atomically (temp file plus rename) and only when something
  changed, so repeat runs produce no diff and no empty commit.
- A schema-1 index is not migrated. Delete `data/audio/` and rerun.
- `FLASHCARDS_DATA_DIR` points the generator at a scratch copy of `data/`. Only
  useful for testing the generator itself.

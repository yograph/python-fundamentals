export const HELP = `
Generate text-to-speech audio for every word in every deck.

Usage
  node tools/audio-gen/src/generate.mjs [options]

Decks come from data/manifest.json; words come from each deck's tab-separated
bank under data/banks/. Each word needs two clips: the front text in the deck's
front locale and the back text in its back locale. Inline formatting
(\`**bold**\`, \`*italic*\`, \`__underline__\`) is stripped before both speaking
and keying, so restyling a word never regenerates its audio. Clips are
deduplicated across decks by the \`\${locale}:\${strippedText}\` key, generated
with the Gemini TTS API, encoded to Opus-in-Ogg with ffmpeg, and written to
data/audio/<locale>/<hash>.ogg with a lookup table at data/audio/index.json.

The run is incremental: a clip is generated only when its key is missing from
the index or its file is missing from disk. Clips whose text no longer appears
in any deck are pruned, but only after an otherwise clean full run, so a
partial failure never deletes good audio.

Options
  --dry-run            Report what would be generated and pruned. Makes zero API
                       calls and writes nothing. Works without an API key.
  --force              Regenerate every clip, ignoring the existing index.
  --deck <id>          Restrict to one deck. Disables pruning.
  --locales <a,b>      Only these locales, comma separated (e.g. nl-NL).
                       Roughly halves the cost of a two-language deck when you
                       never study back-to-front. Disables pruning.
  --limit <n>          Stop after generating n clips. Disables pruning.
  --concurrency <n>    Clips generated in parallel (default 2, max 4).
  -h, --help           Show this help.

Environment
  GEMINI_API_KEY       Required for real runs. Never logged.
  FLASHCARDS_DATA_DIR  Override the data/ directory (testing only).

Requires ffmpeg on PATH.
`.trim();

const FLAGS_WITH_VALUE = new Set([
  "--deck",
  "--locales",
  "--limit",
  "--concurrency",
]);

class UsageError extends Error {}

/**
 * Hand-rolled argument parsing: this package has no dependencies, and the flag
 * surface is small enough that a parser library would cost more than it saves.
 * Accepts both `--deck dutch-1` and `--deck=dutch-1`.
 */
export function parseArgs(argv) {
  const options = {
    help: false,
    dryRun: false,
    force: false,
    deck: null,
    locales: null,
    limit: null,
    concurrency: 2,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    let value = eq === -1 ? null : arg.slice(eq + 1);

    if (FLAGS_WITH_VALUE.has(name) && value === null) {
      value = argv[i + 1];
      i += 1;
    }
    if (FLAGS_WITH_VALUE.has(name) && (value === undefined || value === "")) {
      throw new UsageError(`${name} needs a value.`);
    }

    switch (name) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--deck":
        options.deck = value;
        break;
      case "--locales":
        options.locales = localeList(name, value);
        break;
      case "--limit":
        options.limit = positiveInt(name, value);
        break;
      case "--concurrency":
        options.concurrency = Math.min(4, positiveInt(name, value));
        break;
      default:
        throw new UsageError(
          `Unknown option: ${arg}\nRun with --help to see the supported flags.`,
        );
    }
  }

  return options;
}

/**
 * Comma-separated BCP-47 tags. Shape is checked here; whether a locale is
 * actually used by a deck is checked against the decks themselves, so a typo
 * fails the run instead of quietly planning zero clips.
 */
function localeList(name, value) {
  const locales = [
    ...new Set(
      value
        .split(",")
        .map((locale) => locale.trim())
        .filter((locale) => locale !== ""),
    ),
  ];

  if (locales.length === 0) {
    throw new UsageError(
      `${name} needs at least one locale, e.g. --locales nl-NL.`,
    );
  }

  const malformed = locales.filter(
    (locale) => !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale),
  );
  if (malformed.length > 0) {
    throw new UsageError(
      `${name}: "${malformed.join('", "')}" is not a BCP-47 tag. ` +
        'Expected something like "nl-NL" or "nl-NL,en-US".',
    );
  }

  return locales;
}

function positiveInt(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UsageError(`${name} needs a positive integer, got "${value}".`);
  }
  return parsed;
}

export { UsageError };

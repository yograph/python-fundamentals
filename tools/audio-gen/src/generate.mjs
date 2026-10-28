import fs from "node:fs/promises";
import path from "node:path";
import { HELP, parseArgs, UsageError } from "./args.mjs";
import {
  clipEntry,
  readAudioIndex,
  serializeAudioIndex,
  writeAudioIndexAtomically,
} from "./audio-index.mjs";
import { collectRequiredClips, loadDecks } from "./decks.mjs";
import { assertFfmpegAvailable, encodeToOpusOgg } from "./encode.mjs";
import { AUDIO_DIR, AUDIO_INDEX_PATH, dataPath, rel } from "./paths.mjs";
import { synthesize } from "./tts.mjs";
import { loadVoices, voiceFor } from "./voices.mjs";

main().catch((error) => {
  if (error instanceof UsageError) {
    console.error(`error  ${error.message}`);
    process.exit(2);
  }
  console.error(`error  ${error.message}`);
  process.exit(1);
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const decks = await loadDecks(options.deck);
  const { clips: allRequired, warnings } = collectRequiredClips(decks);
  for (const warning of warnings) console.warn(`warn  ${warning}`);

  const required = filterByLocale(allRequired, options.locales);

  const voiceOverrides = await loadVoices();
  const index = await readAudioIndex();

  const plan = await buildPlan({ required, index, options });

  const scope =
    required.length === allRequired.length
      ? `${allRequired.length} distinct clip(s)`
      : `${required.length} of ${allRequired.length} distinct clip(s) in scope`;
  const wordCount = decks.reduce((total, deck) => total + deck.words.length, 0);
  console.log(
    `${decks.length} deck(s), ${wordCount} word(s), ${scope}: ` +
      `${plan.toGenerate.length} to generate, ${plan.keptCount} up to date, ` +
      `${plan.toPrune.length} to prune` +
      (plan.pruneBlockedReason
        ? ` (prune skipped: ${plan.pruneBlockedReason})`
        : ""),
  );

  if (options.dryRun) {
    reportDryRun(plan);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (plan.toGenerate.length > 0 && !apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set, and this run has clips to generate.\n" +
        "Set it (see tools/audio-gen/README.md) or rerun with --dry-run.",
    );
  }
  if (plan.toGenerate.length > 0) await assertFfmpegAvailable();

  const results = await generateAll({
    tasks: plan.toGenerate,
    apiKey,
    voiceOverrides,
    concurrency: options.concurrency,
  });

  const clips = { ...plan.keptClips };
  for (const result of results.succeeded) clips[result.key] = result.entry;

  let pruned = 0;
  if (results.failed.length > 0) {
    // A partial failure must never delete audio: the required set we would
    // prune against may be incomplete for reasons we do not understand yet.
    console.warn(
      `warn  ${results.failed.length} clip(s) failed; keeping every existing clip`,
    );
    for (const entry of plan.toPrune) clips[entry.key] = entry.entry;
  } else if (plan.canPrune) {
    pruned = await prune({ toPrune: plan.toPrune, clips });
  } else if (plan.toPrune.length > 0) {
    for (const entry of plan.toPrune) clips[entry.key] = entry.entry;
  }

  const voices = resolveVoices({
    clips,
    generated: results.succeeded,
    previousVoices: index.voices,
    voiceOverrides,
  });

  await persistIndex({ index, clips, voices });

  console.log(
    `done  generated ${results.succeeded.length}, skipped ${plan.keptCount}, ` +
      `pruned ${pruned}, failed ${results.failed.length}`,
  );

  if (results.failed.length > 0) {
    for (const failure of results.failed) {
      console.error(`fail  ${failure.key}: ${failure.message}`);
    }
    process.exitCode = 1;
  }
}

/**
 * Narrow the run to an allowlist of locales. A deck's back side is usually the
 * learner's own language, so `--locales nl-NL` on a Dutch/English deck halves
 * the API calls. Clips outside the allowlist are left exactly as they are, in
 * the index and on disk: this filter never deletes, because it also switches
 * pruning off (see buildPlan).
 */
function filterByLocale(clips, locales) {
  if (!locales) return clips;

  const allowed = new Set(locales);
  const present = new Set(clips.map((clip) => clip.locale));

  // A typo ("nl_NL") would otherwise plan zero clips and look like success.
  const unknown = [...allowed].filter((locale) => !present.has(locale));
  if (unknown.length > 0) {
    throw new Error(
      `--locales: no deck uses ${unknown.join(", ")}. ` +
        `Locales in scope: ${[...present].sort().join(", ")}.`,
    );
  }

  return clips.filter((clip) => allowed.has(clip.locale));
}

/**
 * Decide what to generate and what to prune. Incremental by design: a clip is
 * regenerated only when the index does not know it, its file is gone, or its
 * stored path no longer matches the hash of its key.
 */
async function buildPlan({ required, index, options }) {
  const toGenerate = [];
  const keptClips = {};
  let keptCount = 0;

  for (const clip of required) {
    const entry = index.clips[clip.key];
    const reason = options.force
      ? "forced"
      : !entry
        ? "new"
        : entry.path !== clip.path
          ? "path changed"
          : !(await fileExists(dataPath(entry.path)))
            ? "file missing"
            : null;

    if (reason === null) {
      keptClips[clip.key] = entry;
      keptCount += 1;
    } else {
      toGenerate.push({ ...clip, reason });
    }
  }

  const truncated =
    options.limit !== null && toGenerate.length > options.limit
      ? toGenerate.length - options.limit
      : 0;
  const limited =
    truncated > 0 ? toGenerate.slice(0, options.limit) : toGenerate;

  const requiredKeys = new Set(required.map((clip) => clip.key));
  const toPrune = Object.entries(index.clips)
    .filter(([key]) => !requiredKeys.has(key))
    .map(([key, entry]) => ({ key, entry }));

  // Every one of these narrows the desired clip set, which would make the
  // pruner read "not required" as "delete". Pruning is only ever safe when the
  // run looked at every clip every deck needs.
  const pruneBlockedReason = options.deck
    ? "--deck restricts the deck set"
    : options.locales
      ? "--locales restricts the locale set"
      : truncated > 0
        ? "--limit left work undone"
        : null;

  return {
    toGenerate: limited,
    truncated,
    keptClips,
    keptCount,
    toPrune,
    canPrune: pruneBlockedReason === null,
    pruneBlockedReason,
  };
}

function reportDryRun(plan) {
  for (const clip of plan.toGenerate) {
    console.log(`would generate  ${clip.path}  [${clip.reason}]  ${clip.key}`);
  }
  if (plan.canPrune) {
    for (const { key, entry } of plan.toPrune) {
      console.log(`would prune     ${entry.path}  ${key}`);
    }
  }
  if (plan.truncated > 0) {
    console.log(`note  --limit left ${plan.truncated} clip(s) for a later run`);
  }
  console.log("dry run: no API calls made, nothing written");
}

async function generateAll({ tasks, apiKey, voiceOverrides, concurrency }) {
  const succeeded = [];
  const failed = [];
  let done = 0;

  await pool(tasks, concurrency, async (task) => {
    const voiceName = voiceFor(voiceOverrides, task.locale);
    try {
      const { pcm, sampleRate } = await synthesize({
        text: task.text,
        languageLabel: task.label,
        voiceName,
        apiKey,
        onRetry: ({ attempt, maxAttempts, waitMs, error }) => {
          console.warn(
            `retry ${task.key} (${attempt}/${maxAttempts}, ` +
              `waiting ${Math.round(waitMs / 100) / 10}s): ${error.message}`,
          );
        },
      });

      const ogg = await encodeToOpusOgg(pcm, sampleRate);
      const absolute = dataPath(task.path);
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, ogg);

      done += 1;
      console.log(
        `gen   ${pad(`${done}/${tasks.length}`, 9)} ${task.path}  ` +
          `${formatBytes(ogg.length)}  ${voiceName}  ${task.key}`,
      );

      succeeded.push({
        key: task.key,
        locale: task.locale,
        voiceName,
        entry: clipEntry({ path: task.path, bytes: ogg.length }),
      });
    } catch (error) {
      failed.push({ key: task.key, message: error.message });
    }
  });

  return { succeeded, failed };
}

/**
 * Delete stale clips (index entry and file together), plus any orphaned .ogg
 * that no longer belongs to a known clip: the case where an index entry was
 * lost but its file was not.
 */
async function prune({ toPrune, clips }) {
  let pruned = 0;

  for (const { key, entry } of toPrune) {
    await fs.rm(dataPath(entry.path), { force: true });
    console.log(`prune ${entry.path}  ${key}`);
    pruned += 1;
  }

  const expected = new Map();
  for (const entry of Object.values(clips)) {
    expected.set(entry.path, true);
  }

  let localeDirs;
  try {
    localeDirs = await fs.readdir(AUDIO_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return pruned;
    throw error;
  }

  for (const dirent of localeDirs) {
    if (!dirent.isDirectory()) continue;
    const localeDir = path.join(AUDIO_DIR, dirent.name);
    const files = await fs.readdir(localeDir);
    for (const file of files) {
      if (!file.endsWith(".ogg")) continue;
      if (expected.has(`audio/${dirent.name}/${file}`)) continue;
      await fs.rm(path.join(localeDir, file), { force: true });
      console.log(`prune audio/${dirent.name}/${file}  (orphaned file)`);
      pruned += 1;
    }
    // Locale removed from every deck: leave no empty directory behind.
    await fs.rmdir(localeDir).catch(() => {
      /* not empty, which is the normal case */
    });
  }

  return pruned;
}

/**
 * Record the voice actually used per locale. Clips skipped this run keep the
 * voice the index already claims; regenerate with --force after changing a
 * voice so the recorded voice and the audio cannot drift apart.
 */
function resolveVoices({ clips, generated, previousVoices, voiceOverrides }) {
  const generatedVoiceByLocale = new Map(
    generated.map((result) => [result.locale, result.voiceName]),
  );
  const voices = {};

  for (const key of Object.keys(clips)) {
    const locale = key.slice(0, key.indexOf(":"));
    voices[locale] =
      generatedVoiceByLocale.get(locale) ??
      previousVoices[locale] ??
      voiceFor(voiceOverrides, locale);
  }
  return voices;
}

/**
 * Write only when something actually changed, to keep diffs and commits honest.
 * The index carries no timestamp, so an unchanged run is byte-identical anyway;
 * skipping the write just avoids touching the file's mtime.
 */
async function persistIndex({ index, clips, voices }) {
  const contents = serializeAudioIndex({ voices, clips });
  const unchanged =
    contents ===
    serializeAudioIndex({ voices: index.voices, clips: index.clips });

  if (unchanged && (await fileExists(AUDIO_INDEX_PATH))) {
    console.log(`index ${rel(AUDIO_INDEX_PATH)} unchanged`);
    return;
  }

  await writeAudioIndexAtomically(contents);
  console.log(`index ${rel(AUDIO_INDEX_PATH)} written`);
}

/** Bounded concurrency: enough to hide latency, low enough to stay under quota. */
async function pool(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (next < items.length) {
        const item = items[next];
        next += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

async function fileExists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function pad(text, width) {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

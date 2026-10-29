#!/usr/bin/env node

// Validates everything under data/ against docs/DATA_CONTRACT.md.
//
//   node src/validate.mjs        (or: pnpm data:validate)
//
// Never stops at the first problem: it collects every one, groups them by the
// invariant they violate and prints them as plain lines, because this runs in CI
// and a log the author has to re-run to see the next error is a waste of a run.
//
// Exit 0 = valid (warnings may still be printed). Exit 1 = at least one error.
// Unbalanced inline markup is a WARNING by contract — it renders as literal
// text, so it is a typo, not corruption.

import fs from "node:fs";
import path from "node:path";
import { buildManifest, serializeManifest } from "./build-manifest.mjs";
import { readJson } from "./json.mjs";
import {
  bankAbsolutePath,
  bankRelativePath,
  EXERCISE_KINDS,
  exerciseAbsolutePath,
  exerciseRelativePath,
  isSafeRelativePath,
  listBankFiles,
  listExerciseFiles,
  loadBank,
  loadExerciseSet,
  loadLibrary,
  REQUIRED_COLUMNS,
  SCHEMA_VERSION,
} from "./library.mjs";
import { hasFormatting, stripFormatting, validateInline } from "./markup.mjs";
import {
  AUDIO_INDEX_PATH,
  BANKS_DIR,
  DATA_DIR,
  EXERCISES_DIR,
  LIBRARY_PATH,
  MANIFEST_PATH,
  rel,
} from "./paths.mjs";
import { isValidWordId } from "./slug.mjs";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const BCP47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** @type {Array<{invariant: number, message: string}>} */
const problems = [];
/** @type {string[]} */
const warnings = [];

/** @param {number} invariant 1-9, or 0 for structural / field-type problems */
function fail(invariant, message) {
  problems.push({ invariant, message });
}
function warn(message) {
  warnings.push(message);
}

function checkLanguages(where, languages) {
  if (!languages || typeof languages !== "object" || Array.isArray(languages)) {
    fail(0, `${where}: languages must be { front, back }`);
    return [];
  }
  const locales = [];
  for (const side of ["front", "back"]) {
    const lang = languages[side];
    if (!lang || typeof lang !== "object") {
      fail(0, `${where}: languages.${side} must be { label, locale }`);
      continue;
    }
    if (typeof lang.label !== "string" || lang.label === "") {
      fail(0, `${where}: languages.${side}.label must be a non-empty string`);
    } else if (hasFormatting(lang.label)) {
      fail(
        0,
        `${where}: languages.${side}.label must be plain text (no inline markup)`,
      );
    }
    if (typeof lang.locale !== "string" || !BCP47.test(lang.locale)) {
      fail(
        0,
        `${where}: languages.${side}.locale ${JSON.stringify(lang.locale)} is not a BCP-47 tag`,
      );
    } else {
      locales.push(lang.locale);
    }
  }
  return locales;
}

// --- library.json ----------------------------------------------------------

const libraryWhere = rel(LIBRARY_PATH);
let library = null;
try {
  library = loadLibrary();
} catch (error) {
  fail(0, error.message);
}

/** @type {Array<{id: string, bank: string, entry: object}>} */
const entries = [];
/** Locales any deck actually uses, for invariant 7. */
const usedLocales = new Set();

if (library) {
  if (library.schemaVersion !== SCHEMA_VERSION) {
    fail(
      0,
      `${libraryWhere}: schemaVersion is ${JSON.stringify(library.schemaVersion)}, expected ${SCHEMA_VERSION}`,
    );
  }
  for (const key of ["revision", "wordCount", "tags"]) {
    if (key in library) {
      fail(
        0,
        `${libraryWhere}: "${key}" is derived and must not appear in the authored library`,
      );
    }
  }
  if (!Array.isArray(library.decks)) {
    fail(0, `${libraryWhere}: decks must be an array`);
  } else {
    const seenIds = new Map();
    library.decks.forEach((entry, index) => {
      const at = `${libraryWhere}: decks[${index}]${entry?.id ? ` (${entry.id})` : ""}`;

      if (typeof entry?.id !== "string" || entry.id === "") {
        fail(0, `${at}: id must be a non-empty string`);
      } else if (seenIds.has(entry.id)) {
        // Invariant 2. With the bank path derived from the id, a duplicate id is
        // also two decks claiming one bank file, so this is the only place that
        // collision needs reporting.
        fail(
          2,
          `${libraryWhere}: duplicate deck id "${entry.id}" at decks[${seenIds.get(entry.id)}] and decks[${index}]` +
            " — ids must be unique, and two decks cannot share one bank file",
        );
      } else {
        seenIds.set(entry.id, index);
      }

      if (typeof entry?.name !== "string" || entry.name === "") {
        fail(0, `${at}: name must be a non-empty string`);
      }
      if (typeof entry?.color !== "string" || !HEX_COLOR.test(entry.color)) {
        fail(0, `${at}: color ${JSON.stringify(entry?.color)} must be #RRGGBB`);
      }
      for (const locale of checkLanguages(at, entry?.languages)) {
        usedLocales.add(locale);
      }
      // `icon` is optional, and its VALUE is deliberately not checked here: the
      // curated set of names lives in the frontend, and duplicating that list is
      // exactly the cross-tool duplication schema 2 exists to remove. An
      // unrecognized name renders the fallback icon, so a typo costs a deck its
      // icon instead of failing CI. Only the type is our business.
      if (entry && "icon" in entry) {
        if (typeof entry.icon !== "string" || entry.icon === "") {
          fail(
            0,
            `${at}: icon ${JSON.stringify(entry.icon)} must be a non-empty string (omit the key for the default icon)`,
          );
        }
      }
      // Derived fields must not be authored. `bank` is here because it used to
      // be authored: it is now derived from `id`, so a leftover line is stale
      // rather than wrong, and the fix is simply to delete it.
      for (const key of ["revision", "wordCount", "tags"]) {
        if (entry && key in entry) {
          fail(0, `${at}: "${key}" is derived and must not be authored here`);
        }
      }
      if (entry && "bank" in entry) {
        fail(
          0,
          `${at}: "bank" is no longer a field — a deck's words are always at ` +
            `${bankRelativePath(entry.id)}, derived from its id. Delete the line.`,
        );
      }

      if (typeof entry?.id === "string" && entry.id !== "") {
        entries.push({ id: entry.id, bank: bankRelativePath(entry.id), entry });
      }
    });
  }
}

// --- banks -----------------------------------------------------------------

/** @type {Map<string, ReturnType<typeof loadBank>>} */
const loadedBanks = new Map();
/** Bank paths (relative to data/) claimed by a deck, for the orphan sweep. */
const claimedBanks = new Set();

for (const { id, bank } of entries) {
  claimedBanks.add(bank);

  // Invariant 1: the deck's bank exists at the derived path.
  if (!fs.existsSync(bankAbsolutePath(id))) {
    fail(
      1,
      `${libraryWhere}: deck "${id}" has no bank file — expected data/${bank}`,
    );
    continue;
  }

  let loaded;
  try {
    loaded = loadBank(id);
  } catch (error) {
    fail(0, `data/${bank}: ${error.message}`);
    continue;
  }
  loadedBanks.set(id, loaded);
  const where = `data/${bank}`;

  // Invariant 3: parse-level problems (short rows, stray tabs, bad header).
  for (const parseProblem of loaded.problems) {
    const at =
      parseProblem.line === null ? where : `${where}:${parseProblem.line}`;
    fail(3, `${at}: ${parseProblem.message}`);
  }
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !loaded.columns.includes(column),
  );
  if (missingColumns.length > 0) {
    fail(
      3,
      `${where}: missing required column(s) ${missingColumns.map((c) => `"${c}"`).join(", ")}` +
        ` (header: ${loaded.columns.join(", ") || "none"})` +
        " — skipping this bank's row checks until the header is fixed",
    );
    // Without `front`/`back`/`id` every row would report the same missing
    // value, burying the one problem that matters under a screen of noise.
    continue;
  }
  if (loaded.words.length === 0) {
    fail(3, `${where}: bank has no word rows`);
  }
  if (!loaded.text.endsWith("\n")) {
    warn(`${where}: file does not end with a newline`);
  }

  // Invariants 4 and 5, per word.
  const seenWordIds = new Map();
  for (const word of loaded.words) {
    const at = `${where}:${word.line}`;

    // A column the row stopped short of was already reported as a short row
    // under invariant 3; saying "back must not be empty" as well would report
    // one slip twice.
    if (word.front === "" && !word.missing.includes("front")) {
      fail(0, `${at}: front must not be empty`);
    }
    if (word.back === "" && !word.missing.includes("back")) {
      fail(0, `${at}: back must not be empty`);
    }

    if (word.id === "") {
      // Unless the row simply stopped short, which invariant 3 already covers.
      if (!word.missing.includes("id")) fail(4, `${at}: id must not be empty`);
    } else if (seenWordIds.has(word.id)) {
      fail(
        4,
        `${at}: duplicate word id "${word.id}" (first seen on line ${seenWordIds.get(word.id)})`,
      );
    } else {
      seenWordIds.set(word.id, word.line);
      if (word.front !== "" && !isValidWordId(word.id, word.front)) {
        fail(
          4,
          `${at}: id "${word.id}" does not match the slug rules for front ${JSON.stringify(word.front)}`,
        );
      }
    }

    // Invariant 5: unbalanced markup is a warning, never a failure.
    for (const side of ["front", "back"]) {
      for (const message of validateInline(word[side])) {
        warn(`${at}: ${side} ${JSON.stringify(word[side])}: ${message}`);
      }
    }
    for (const tag of word.tags) {
      if (hasFormatting(tag)) {
        warn(
          `${at}: tag "${tag}" looks like inline markup; tags are plain text`,
        );
      }
    }
  }
}

// Invariant 1, other direction: no bank file that no deck claims. "Claimed by
// exactly one entry" needs no separate count now that the path is derived — two
// entries can only claim one file by sharing an id, which invariant 2 reports.
for (const name of listBankFiles()) {
  const bankRelative = `banks/${name}`;
  if (claimedBanks.has(bankRelative)) continue;
  fail(
    1,
    `${rel(path.join(BANKS_DIR, name))}: orphan bank — no deck in ${libraryWhere} has id "${path.basename(name, ".tsv")}"`,
  );
}

// --- exercise sets (invariant 8) --------------------------------------------

/** A lowercase slug, the shape exercise ids and set ids must have. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const nonEmptyString = (value) => typeof value === "string" && value !== "";

/**
 * Warn (not fail) when learner-facing exercise text carries inline markup:
 * exercise text is rendered as plain text by contract, so markup would show
 * its delimiters literally — a typo, not corruption.
 */
function warnOnMarkup(at, field, value) {
  if (typeof value === "string" && hasFormatting(value)) {
    warn(`${at}: ${field} looks like inline markup; exercise text is plain`);
  }
}

/** Per-kind item checks. Structural problems fail; style problems warn. */
const EXERCISE_ITEM_CHECKS = {
  grammar(at, item) {
    if (!nonEmptyString(item.prompt))
      fail(8, `${at}: prompt must be a non-empty string`);
    if (!Array.isArray(item.choices) || item.choices.length < 2) {
      fail(8, `${at}: choices must be an array of at least 2 options`);
    } else {
      if (!item.choices.every(nonEmptyString)) {
        fail(8, `${at}: every choice must be a non-empty string`);
      }
      if (new Set(item.choices).size !== item.choices.length) {
        fail(8, `${at}: choices must be distinct`);
      }
      if (
        !Number.isInteger(item.answerIndex) ||
        item.answerIndex < 0 ||
        item.answerIndex >= item.choices.length
      ) {
        fail(
          8,
          `${at}: answerIndex ${JSON.stringify(item.answerIndex)} must be an integer index into choices`,
        );
      }
    }
    if (!nonEmptyString(item.explanation)) {
      fail(8, `${at}: explanation must be a non-empty string`);
    }
    if ("code" in item && !nonEmptyString(item.code)) {
      fail(8, `${at}: code must be a non-empty string (omit the key instead)`);
    }
    if ("codeChoices" in item && typeof item.codeChoices !== "boolean") {
      fail(8, `${at}: codeChoices must be a boolean when present`);
    }
    // Every learner-facing field, not just the prompt: choices render as
    // buttons and the explanation as feedback, all plain text. Code is shown
    // verbatim and full of `*` and `__`, so `code` and code choices are not
    // checked for markup.
    warnOnMarkup(at, "prompt", item.prompt);
    warnOnMarkup(at, "explanation", item.explanation);
    if (Array.isArray(item.choices) && item.codeChoices !== true) {
      item.choices.forEach((choice, index) => {
        warnOnMarkup(at, `choices[${index}]`, choice);
      });
    }
  },
  translation(at, item) {
    for (const field of ["source", "reference"]) {
      if (!nonEmptyString(item[field])) {
        fail(8, `${at}: ${field} must be a non-empty string`);
      }
      warnOnMarkup(at, field, item[field]);
    }
    if (item.direction !== "nl-en" && item.direction !== "en-nl") {
      fail(
        8,
        `${at}: direction ${JSON.stringify(item.direction)} must be "nl-en" or "en-nl"`,
      );
    }
  },
  writing(at, item) {
    for (const field of ["prompt", "instructions", "example"]) {
      if (!nonEmptyString(item[field])) {
        fail(8, `${at}: ${field} must be a non-empty string`);
      }
      warnOnMarkup(at, field, item[field]);
    }
  },
};

// --- grammar lessons (invariant 9) -----------------------------------------

/** Required string fields per lesson block type; `caption` is the one optional. */
const LESSON_BLOCK_FIELDS = {
  heading: ["text"],
  text: ["text"],
  rule: ["text"],
  tip: ["text"],
  list: ["items"],
  table: ["headers", "rows"],
  examples: ["items"],
  mistake: ["wrong", "right", "why"],
  code: ["code"],
  bug: ["wrong", "right", "why"],
};

/**
 * Block fields shown verbatim as code. They are never parsed as markup, so
 * they are exempt from the markup warning — Python is full of `*` and `__`.
 */
const CODE_FIELDS = new Set(["code", "output", "wrong", "right"]);
const CODE_BLOCK_TYPES = new Set(["code", "bug"]);

/** Lesson text may carry card markup; unbalanced markup warns, as on cards. */
function warnOnBadMarkup(at, value) {
  for (const message of validateInline(value)) warn(`${at}: ${message}`);
}

/**
 * A grammar set's lessons, and the link to its exercises: every exercise
 * drills exactly one lesson (named in its tags), and every lesson has at
 * least one exercise. Both directions matter — an exercise tied to no lesson
 * is invisible from the course, and a lesson with none has no practice.
 */
function checkLessons(where, lessons, exercises) {
  const lessonIds = new Map();
  lessons.forEach((lesson, index) => {
    const at = `${where}: lessons[${index}]${lesson?.id ? ` (${lesson.id})` : ""}`;
    if (!nonEmptyString(lesson?.id) || !SLUG.test(lesson.id)) {
      fail(9, `${at}: id must be a lowercase slug`);
    } else if (lessonIds.has(lesson.id)) {
      fail(
        9,
        `${at}: duplicate lesson id (first at lessons[${lessonIds.get(lesson.id)}])`,
      );
    } else {
      lessonIds.set(lesson.id, index);
    }
    for (const field of ["title", "summary"]) {
      if (!nonEmptyString(lesson?.[field])) {
        fail(9, `${at}: ${field} must be a non-empty string`);
      } else if (hasFormatting(lesson[field])) {
        warn(`${at}: ${field} looks like inline markup; it is plain text`);
      }
    }
    if (!Array.isArray(lesson?.blocks) || lesson.blocks.length === 0) {
      fail(9, `${at}: blocks must be a non-empty array`);
      return;
    }
    lesson.blocks.forEach((block, blockIndex) => {
      const blockAt = `${at} blocks[${blockIndex}]`;
      const fields = LESSON_BLOCK_FIELDS[block?.type];
      if (!fields) {
        fail(
          9,
          `${blockAt}: unknown block type ${JSON.stringify(block?.type)}`,
        );
        return;
      }
      if (block.type === "list") {
        if (
          !Array.isArray(block.items) ||
          block.items.length === 0 ||
          !block.items.every(nonEmptyString)
        ) {
          fail(9, `${blockAt}: items must be a non-empty array of strings`);
        } else {
          for (const item of block.items) warnOnBadMarkup(blockAt, item);
        }
      } else if (block.type === "table") {
        if ("caption" in block && !nonEmptyString(block.caption)) {
          fail(9, `${blockAt}: caption must be non-empty when present`);
        }
        if (
          !Array.isArray(block.headers) ||
          block.headers.length === 0 ||
          !block.headers.every(nonEmptyString)
        ) {
          fail(9, `${blockAt}: headers must be a non-empty array of strings`);
        } else if (!Array.isArray(block.rows) || block.rows.length === 0) {
          fail(9, `${blockAt}: rows must be a non-empty array`);
        } else {
          block.rows.forEach((row, rowIndex) => {
            if (
              !Array.isArray(row) ||
              row.length !== block.headers.length ||
              !row.every((cell) => typeof cell === "string")
            ) {
              fail(
                9,
                `${blockAt}: row ${rowIndex} must be ${block.headers.length} strings, one per header`,
              );
            } else {
              for (const cell of row) warnOnBadMarkup(blockAt, cell);
            }
          });
        }
      } else if (block.type === "examples") {
        if (!Array.isArray(block.items) || block.items.length === 0) {
          fail(9, `${blockAt}: items must be a non-empty array`);
        } else {
          block.items.forEach((item, itemIndex) => {
            if (!nonEmptyString(item?.nl) || !nonEmptyString(item?.en)) {
              fail(9, `${blockAt} item ${itemIndex}: nl and en are required`);
            }
            if (item && "note" in item && !nonEmptyString(item.note)) {
              fail(
                9,
                `${blockAt} item ${itemIndex}: note must be non-empty when present`,
              );
            }
            for (const key of ["nl", "en", "note"]) {
              if (nonEmptyString(item?.[key]))
                warnOnBadMarkup(blockAt, item[key]);
            }
          });
        }
      } else {
        for (const field of fields) {
          if (!nonEmptyString(block[field])) {
            fail(9, `${blockAt}: ${field} must be a non-empty string`);
          } else if (
            !(CODE_BLOCK_TYPES.has(block.type) && CODE_FIELDS.has(field))
          ) {
            warnOnBadMarkup(blockAt, block[field]);
          }
        }
        if (block.type === "code") {
          for (const field of ["caption", "output"]) {
            if (field in block && !nonEmptyString(block[field])) {
              fail(9, `${blockAt}: ${field} must be non-empty when present`);
            }
          }
          if (nonEmptyString(block.caption)) {
            warnOnBadMarkup(blockAt, block.caption);
          }
        }
      }
    });
  });

  const exerciseCounts = new Map([...lessonIds.keys()].map((id) => [id, 0]));
  exercises.forEach((item, itemIndex) => {
    if (!Array.isArray(item?.tags)) return; // reported under invariant 8
    const linked = item.tags.filter((tag) => lessonIds.has(tag));
    if (linked.length !== 1) {
      fail(
        9,
        `${where}: exercises[${itemIndex}]${item?.id ? ` (${item.id})` : ""} must name exactly one lesson id in its tags (names ${linked.length})`,
      );
      return;
    }
    exerciseCounts.set(linked[0], exerciseCounts.get(linked[0]) + 1);
  });
  for (const [id, count] of exerciseCounts) {
    if (count === 0) fail(9, `${where}: lesson "${id}" has no exercises`);
  }
}

// --- coding labs (invariant 10) --------------------------------------------

const LAB_MODES = ["guided", "change", "write", "challenge"];
const isStringArray = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * A set's coding labs, structurally. Whether each solution really passes its
 * tests is proven by tools/course-check/check_labs.py, which runs them; this
 * only guarantees the app can render every step.
 */
function checkLabs(where, labs, lessons) {
  const lessonIds = new Set(
    (Array.isArray(lessons) ? lessons : []).map((lesson) => lesson?.id),
  );
  const labIds = new Set();
  labs.forEach((lab, index) => {
    const at = `${where}: labs[${index}]${lab?.id ? ` (${lab.id})` : ""}`;
    if (!nonEmptyString(lab?.id) || !SLUG.test(lab.id)) {
      fail(10, `${at}: id must be a lowercase slug`);
    } else if (labIds.has(lab.id)) {
      fail(10, `${at}: duplicate lab id`);
    } else {
      labIds.add(lab.id);
    }
    if (!lessonIds.has(lab?.lesson)) {
      fail(
        10,
        `${at}: lesson ${JSON.stringify(lab?.lesson)} is not a lesson of this set`,
      );
    }
    for (const field of ["title", "summary"]) {
      if (!nonEmptyString(lab?.[field])) {
        fail(10, `${at}: ${field} must be a non-empty string`);
      }
    }
    if (!Array.isArray(lab?.steps) || lab.steps.length === 0) {
      fail(10, `${at}: steps must be a non-empty array`);
      return;
    }
    const stepIds = new Set();
    lab.steps.forEach((step, stepIndex) => {
      const stepAt = `${at} steps[${stepIndex}]${step?.id ? ` (${step.id})` : ""}`;
      if (!nonEmptyString(step?.id) || !SLUG.test(step.id)) {
        fail(10, `${stepAt}: id must be a lowercase slug`);
      } else if (stepIds.has(step.id)) {
        fail(10, `${stepAt}: duplicate step id within the lab`);
      } else {
        stepIds.add(step.id);
      }
      if (!LAB_MODES.includes(step?.mode)) {
        fail(10, `${stepAt}: mode must be one of ${LAB_MODES.join(", ")}`);
      }
      for (const field of ["title", "instructions", "solution"]) {
        if (!nonEmptyString(step?.[field])) {
          fail(10, `${stepAt}: ${field} must be a non-empty string`);
        }
      }
      if (nonEmptyString(step?.instructions)) {
        warnOnBadMarkup(stepAt, step.instructions);
      }
      if ("guide" in (step ?? {})) {
        if (
          !Array.isArray(step.guide) ||
          step.guide.length === 0 ||
          !step.guide.every(
            (piece) =>
              nonEmptyString(piece?.code) && nonEmptyString(piece?.explain),
          )
        ) {
          fail(
            10,
            `${stepAt}: guide must be a non-empty array of {code, explain}`,
          );
        } else if (
          step.guide.map((piece) => piece.code).join("\n") !== step.solution
        ) {
          fail(
            10,
            `${stepAt}: guide pieces joined with newlines must equal the solution`,
          );
        }
      }
      if ("starter" in (step ?? {}) && typeof step.starter !== "string") {
        fail(10, `${stepAt}: starter must be a string`);
      }
      if ("carryOver" in (step ?? {})) {
        if (typeof step.carryOver !== "boolean") {
          fail(10, `${stepAt}: carryOver must be a boolean`);
        } else if (step.carryOver && (stepIndex === 0 || "starter" in step)) {
          fail(10, `${stepAt}: carryOver needs a previous step and no starter`);
        }
      }
      for (const field of ["inputs", "hints"]) {
        if (field in (step ?? {}) && !isStringArray(step[field])) {
          fail(10, `${stepAt}: ${field} must be an array of strings`);
        }
      }
      for (const hint of isStringArray(step?.hints) ? step.hints : []) {
        warnOnBadMarkup(stepAt, hint);
      }
      if (!Array.isArray(step?.tests) || step.tests.length === 0) {
        fail(10, `${stepAt}: tests must be a non-empty array`);
      } else {
        step.tests.forEach((test, testIndex) => {
          if (
            !["name", "code", "fail"].every((key) =>
              nonEmptyString(test?.[key]),
            )
          ) {
            fail(
              10,
              `${stepAt} tests[${testIndex}]: needs name, code and fail`,
            );
          }
          if ("inputs" in (test ?? {}) && !isStringArray(test.inputs)) {
            fail(
              10,
              `${stepAt} tests[${testIndex}]: inputs must be an array of strings`,
            );
          }
        });
      }
    });
  });
}

/** Exercise set ids claimed by the library, for the orphan sweep. */
const claimedExerciseFiles = new Set();
/** Loaded sets for the summary line. */
const loadedExerciseSets = new Map();

if (library && "exerciseSets" in library) {
  if (!Array.isArray(library.exerciseSets)) {
    fail(0, `${libraryWhere}: exerciseSets must be an array when present`);
  } else {
    const seenSetIds = new Map();
    library.exerciseSets.forEach((set, index) => {
      const at = `${libraryWhere}: exerciseSets[${index}]${set?.id ? ` (${set.id})` : ""}`;

      if (!nonEmptyString(set?.id)) {
        fail(0, `${at}: id must be a non-empty string`);
        return;
      }
      if (!SLUG.test(set.id)) {
        fail(0, `${at}: id "${set.id}" must be a lowercase slug`);
      }
      if (seenSetIds.has(set.id)) {
        fail(
          8,
          `${libraryWhere}: duplicate exercise set id "${set.id}" at exerciseSets[${seenSetIds.get(set.id)}] and exerciseSets[${index}]`,
        );
        return;
      }
      seenSetIds.set(set.id, index);

      if (!nonEmptyString(set.name)) {
        fail(0, `${at}: name must be a non-empty string`);
      }
      if (!EXERCISE_KINDS.includes(set.kind)) {
        fail(
          0,
          `${at}: kind ${JSON.stringify(set.kind)} must be one of ${EXERCISE_KINDS.join(", ")}`,
        );
      }
      if (typeof set.color !== "string" || !HEX_COLOR.test(set.color)) {
        fail(0, `${at}: color ${JSON.stringify(set.color)} must be #RRGGBB`);
      }
      if ("level" in set && !nonEmptyString(set.level)) {
        fail(
          0,
          `${at}: level must be a non-empty string (omit the key instead)`,
        );
      }
      if ("icon" in set && !nonEmptyString(set.icon)) {
        fail(
          0,
          `${at}: icon must be a non-empty string (omit the key for the default)`,
        );
      }
      if ("course" in set && !nonEmptyString(set.course)) {
        fail(
          0,
          `${at}: course must be a non-empty string (omit the key instead)`,
        );
      }
      // Derived fields must not be authored, same rule as decks.
      for (const key of ["exerciseCount", "revision"]) {
        if (key in set) {
          fail(0, `${at}: "${key}" is derived and must not be authored here`);
        }
      }

      claimedExerciseFiles.add(exerciseRelativePath(set.id));

      // Invariant 8: the set's file exists at the derived path and is valid.
      const where = `data/${exerciseRelativePath(set.id)}`;
      if (!fs.existsSync(exerciseAbsolutePath(set.id))) {
        fail(8, `${at}: no exercise file — expected ${where}`);
        return;
      }
      let loaded;
      try {
        loaded = loadExerciseSet(set.id);
      } catch (error) {
        fail(8, `${where}: ${error.message}`);
        return;
      }
      loadedExerciseSets.set(set.id, loaded);

      if (loaded.json?.schemaVersion !== SCHEMA_VERSION) {
        fail(
          0,
          `${where}: schemaVersion is ${JSON.stringify(loaded.json?.schemaVersion)}, expected ${SCHEMA_VERSION}`,
        );
      }
      if (!Array.isArray(loaded.json?.exercises)) {
        fail(8, `${where}: exercises must be an array`);
        return;
      }
      if (loaded.json.exercises.length === 0) {
        fail(8, `${where}: set has no exercises`);
      }

      // A legal kind with no checker would silently validate nothing, so the
      // two registries drifting apart is itself a failure — not a skip.
      const checkItem = EXERCISE_ITEM_CHECKS[set.kind];
      if (!checkItem && EXERCISE_KINDS.includes(set.kind)) {
        fail(
          8,
          `${where}: kind "${set.kind}" is in EXERCISE_KINDS but has no entry ` +
            "in EXERCISE_ITEM_CHECKS — its items would not be checked at all",
        );
      }
      const seenExerciseIds = new Map();
      loaded.json.exercises.forEach((item, itemIndex) => {
        const itemAt = `${where}: exercises[${itemIndex}]${item?.id ? ` (${item.id})` : ""}`;

        if (!nonEmptyString(item?.id)) {
          fail(8, `${itemAt}: id must be a non-empty string`);
        } else if (!SLUG.test(item.id)) {
          fail(8, `${itemAt}: id "${item.id}" must be a lowercase slug`);
        } else if (seenExerciseIds.has(item.id)) {
          fail(
            8,
            `${itemAt}: duplicate exercise id "${item.id}" (first seen at exercises[${seenExerciseIds.get(item.id)}])` +
              " — ids are what a learner's progress is stored under",
          );
        } else {
          seenExerciseIds.set(item.id, itemIndex);
        }

        if (!Array.isArray(item?.tags) || !item.tags.every(nonEmptyString)) {
          fail(8, `${itemAt}: tags must be an array of non-empty strings`);
        }
        if (checkItem) checkItem(itemAt, item ?? {});
      });

      if (loaded.json && "lessons" in loaded.json) {
        if (set.kind !== "grammar") {
          fail(9, `${where}: only grammar sets may carry lessons`);
        } else if (!Array.isArray(loaded.json.lessons)) {
          fail(9, `${where}: lessons must be an array when present`);
        } else {
          checkLessons(where, loaded.json.lessons, loaded.json.exercises);
        }
      }

      if (loaded.json && "labs" in loaded.json) {
        if (set.kind !== "grammar" || !Array.isArray(loaded.json.lessons)) {
          fail(10, `${where}: only grammar sets with lessons may carry labs`);
        } else if (!Array.isArray(loaded.json.labs)) {
          fail(10, `${where}: labs must be an array when present`);
        } else {
          checkLabs(where, loaded.json.labs, loaded.json.lessons);
        }
      }
    });
  }
}

// Invariant 8, other direction: no exercise file that no set claims.
for (const name of listExerciseFiles()) {
  const relative = `exercises/${name}`;
  if (claimedExerciseFiles.has(relative)) continue;
  fail(
    8,
    `${rel(path.join(EXERCISES_DIR, name))}: orphan exercise file — no set in ${libraryWhere} has id "${path.basename(name, ".json")}"`,
  );
}

// --- manifest.json (invariant 6) -------------------------------------------

const manifestWhere = rel(MANIFEST_PATH);
let committedManifest = null;
try {
  committedManifest = fs.readFileSync(MANIFEST_PATH, "utf8");
} catch (error) {
  fail(
    6,
    `${manifestWhere}: cannot read (${error.message}) — run \`pnpm data:manifest\``,
  );
}

let manifest = null;
if (committedManifest !== null) {
  let expected = null;
  try {
    manifest = buildManifest().manifest;
    expected = serializeManifest(manifest);
  } catch (error) {
    fail(6, `cannot regenerate the manifest: ${error.message}`);
  }
  if (expected !== null && expected !== committedManifest) {
    fail(
      6,
      `${manifestWhere} is not what the authored files produce — run \`pnpm data:manifest\` and commit the result`,
    );
    // A short diff of the fields most likely to be stale, to save a round trip.
    let parsed = null;
    try {
      parsed = JSON.parse(committedManifest);
    } catch (error) {
      fail(6, `${manifestWhere}: cannot parse (${error.message})`);
    }
    if (parsed) {
      if (parsed.schemaVersion !== manifest.schemaVersion) {
        fail(
          6,
          `${manifestWhere}: schemaVersion ${JSON.stringify(parsed.schemaVersion)} != ${manifest.schemaVersion}`,
        );
      }
      const committedById = new Map(
        (Array.isArray(parsed.decks) ? parsed.decks : []).map((deck) => [
          deck?.id,
          deck,
        ]),
      );
      for (const deck of manifest.decks) {
        const found = committedById.get(deck.id);
        if (!found) {
          fail(6, `${manifestWhere}: deck "${deck.id}" is missing`);
          continue;
        }
        for (const key of ["wordCount", "revision"]) {
          if (JSON.stringify(found[key]) !== JSON.stringify(deck[key])) {
            fail(
              6,
              `${manifestWhere}: deck "${deck.id}" ${key} ${JSON.stringify(found[key])} != expected ${JSON.stringify(deck[key])}`,
            );
          }
        }
        // Fields that no longer belong, called out by name: a stale manifest
        // carrying them is otherwise only reported as an opaque byte mismatch.
        for (const key of ["tags", "bank"]) {
          if (key in found) {
            fail(
              6,
              `${manifestWhere}: deck "${deck.id}" still carries "${key}", which is no longer part of the manifest`,
            );
          }
        }
      }
      // Same drill-down for exercise sets: the byte mismatch already failed,
      // these lines just say which set is stale.
      const committedSetsById = new Map(
        (Array.isArray(parsed.exerciseSets) ? parsed.exerciseSets : []).map(
          (set) => [set?.id, set],
        ),
      );
      for (const set of manifest.exerciseSets ?? []) {
        const found = committedSetsById.get(set.id);
        if (!found) {
          fail(6, `${manifestWhere}: exercise set "${set.id}" is missing`);
          continue;
        }
        for (const key of [
          "exerciseCount",
          "lessonCount",
          "labCount",
          "revision",
        ]) {
          if (JSON.stringify(found[key]) !== JSON.stringify(set[key])) {
            fail(
              6,
              `${manifestWhere}: exercise set "${set.id}" ${key} ${JSON.stringify(found[key])} != expected ${JSON.stringify(set[key])}`,
            );
          }
        }
      }
      for (const id of committedSetsById.keys()) {
        if (!(manifest.exerciseSets ?? []).some((set) => set.id === id)) {
          fail(
            6,
            `${manifestWhere}: exercise set ${JSON.stringify(id)} is not in ${libraryWhere}`,
          );
        }
      }
      if ("revision" in parsed) {
        fail(
          6,
          `${manifestWhere}: still carries a top-level "revision", which is no longer part of the manifest (freshness is per deck)`,
        );
      }
      for (const id of committedById.keys()) {
        if (!manifest.decks.some((deck) => deck.id === id)) {
          fail(
            6,
            `${manifestWhere}: deck ${JSON.stringify(id)} is not in ${libraryWhere}`,
          );
        }
      }
    }
  }
}

// --- audio/index.json (invariant 7) ----------------------------------------

let clipCount = 0;
let audioIndex = null;
if (!fs.existsSync(AUDIO_INDEX_PATH)) {
  fail(
    7,
    `${rel(AUDIO_INDEX_PATH)}: missing (an empty index — {} voices, {} clips — is valid)`,
  );
} else {
  try {
    audioIndex = readJson(AUDIO_INDEX_PATH);
  } catch (error) {
    fail(7, error.message);
  }
}

if (audioIndex) {
  const where = rel(AUDIO_INDEX_PATH);

  if (audioIndex.schemaVersion !== SCHEMA_VERSION) {
    fail(
      0,
      `${where}: schemaVersion is ${JSON.stringify(audioIndex.schemaVersion)}, expected ${SCHEMA_VERSION}`,
    );
  }
  for (const key of ["generatedAt", "updatedAt"]) {
    if (key in audioIndex) {
      fail(
        0,
        `${where}: "${key}" must not exist — the index carries no timestamps`,
      );
    }
  }

  const isPlainObject = (value) =>
    value && typeof value === "object" && !Array.isArray(value);

  if (!isPlainObject(audioIndex.voices)) {
    fail(0, `${where}: voices must be an object`);
  } else {
    for (const [locale, voice] of Object.entries(audioIndex.voices)) {
      if (!usedLocales.has(locale)) {
        fail(7, `${where}: voices["${locale}"] is not a locale any deck uses`);
      }
      if (typeof voice !== "string" || voice === "") {
        fail(0, `${where}: voices["${locale}"] must be a non-empty voice name`);
      }
    }
  }

  if (!isPlainObject(audioIndex.clips)) {
    fail(0, `${where}: clips must be an object`);
  } else {
    const clips = Object.entries(audioIndex.clips);
    clipCount = clips.length;

    for (const [key, clip] of clips) {
      const at = `${where}: clips["${key}"]`;
      const separator = key.indexOf(":");
      if (separator <= 0 || separator === key.length - 1) {
        fail(7, `${at}: key must be \`\${locale}:\${strippedText}\``);
        continue;
      }
      const locale = key.slice(0, separator);
      const text = key.slice(separator + 1);

      if (!usedLocales.has(locale)) {
        fail(7, `${at}: locale "${locale}" is not used by any deck`);
      }
      // Clip keys are stripped text: markup in a key means a stale generator.
      if (stripFormatting(text) !== text) {
        fail(
          7,
          `${at}: key text still contains inline markup; it must be stripped to ${JSON.stringify(stripFormatting(text))}`,
        );
      }

      if (!isPlainObject(clip)) {
        fail(7, `${at}: must be an object with path and bytes`);
        continue;
      }
      if (!isSafeRelativePath(clip.path)) {
        fail(
          7,
          `${at}: path ${JSON.stringify(clip.path)} must be relative to data/ and never contain ".."`,
        );
      } else {
        const absolute = path.join(DATA_DIR, clip.path);
        if (!fs.existsSync(absolute)) {
          fail(7, `${at}: no file at data/${clip.path}`);
        } else if (Number.isInteger(clip.bytes)) {
          const actual = fs.statSync(absolute).size;
          if (clip.bytes !== actual) {
            fail(7, `${at}: bytes ${clip.bytes} != actual file size ${actual}`);
          }
        }
      }
      if (!Number.isInteger(clip.bytes) || clip.bytes <= 0) {
        fail(7, `${at}: bytes must be a positive integer`);
      }
      if ("generatedAt" in clip) {
        fail(
          0,
          `${at}: generatedAt must not exist — clips carry no timestamps`,
        );
      }
    }
  }
}

// --- report ----------------------------------------------------------------

const INVARIANT_TITLES = {
  0: "Structure / field types",
  1: "1. Every deck has a bank at banks/<id>.tsv, and no bank is unclaimed",
  2: "2. Deck ids are unique within library.json",
  3: "3. Bank columns, no tabs/newlines in fields, no short rows",
  4: "4. Word ids unique within a bank and slug-shaped",
  5: "5. Inline formatting balanced (warning only)",
  6: "6. manifest.json is a fresh regeneration of the authored files",
  7: "7. audio/index.json clips exist, locales known, keys stripped",
  8: "8. Every exercise set has a valid file at exercises/<id>.json, and no file is unclaimed",
  9: "9. Grammar lessons are well-formed, and every exercise drills exactly one lesson",
  10: "10. Coding labs are well-formed and belong to a lesson of their set",
};

if (warnings.length > 0) {
  console.log(`${warnings.length} warning(s) (not failures):`);
  for (const message of warnings) console.log(`  ! ${message}`);
  console.log("");
}

if (problems.length > 0) {
  console.error(`data validation FAILED: ${problems.length} problem(s)\n`);
  for (const key of Object.keys(INVARIANT_TITLES)) {
    const group = problems.filter(
      (problem) => problem.invariant === Number(key),
    );
    if (group.length === 0) continue;
    console.error(`${INVARIANT_TITLES[key]} — ${group.length} problem(s)`);
    for (const problem of group) console.error(`  - ${problem.message}`);
    console.error("");
  }
  process.exit(1);
}

const totalWords = [...loadedBanks.values()].reduce(
  (sum, bank) => sum + bank.words.length,
  0,
);
const totalExercises = [...loadedExerciseSets.values()].reduce(
  (sum, set) =>
    sum + (Array.isArray(set.json?.exercises) ? set.json.exercises.length : 0),
  0,
);
console.log("data validation OK");
console.log(
  `  ${loadedBanks.size} deck(s), ${totalWords} words, ` +
    `${loadedExerciseSets.size} exercise set(s), ${totalExercises} exercises, ` +
    `${clipCount} audio clip(s), ${warnings.length} warning(s)`,
);
for (const { id } of entries) {
  const bank = loadedBanks.get(id);
  if (!bank) continue;
  const entry = manifest?.decks.find((deck) => deck.id === id);
  console.log(
    `  ${id}: ${bank.words.length} words, revision ${bank.revision} (${bank.bank})`,
  );
  if (entry) {
    console.log(
      `    languages ${entry.languages?.front?.locale} -> ${entry.languages?.back?.locale}` +
        `${entry.icon ? `, icon ${entry.icon}` : ""}`,
    );
  }
}
for (const [id, set] of loadedExerciseSets) {
  const entry = manifest?.exerciseSets?.find(
    (candidate) => candidate.id === id,
  );
  const lessons = Array.isArray(set.json?.lessons)
    ? `${set.json.lessons.length} lessons, `
    : "";
  console.log(
    `  ${id}: ${lessons}${Array.isArray(set.json?.exercises) ? set.json.exercises.length : 0} exercises, ` +
      `revision ${set.revision} (${set.relative})` +
      `${entry ? ` — ${entry.kind}${entry.level ? ` ${entry.level}` : ""}` : ""}`,
  );
}
console.log("  all 10 contract invariants satisfied");

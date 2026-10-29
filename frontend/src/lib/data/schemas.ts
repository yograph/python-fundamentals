import { z } from "zod";
import type {
  AudioClip,
  AudioIndex,
  Deck,
  DeckLanguages,
  DeckSummary,
  LanguageInfo,
  Manifest,
  Word,
} from "@/types/deck";
import type {
  CodingLab,
  ExerciseSetSummary,
  GrammarExercise,
  GrammarLesson,
  LessonBlock,
  TranslationExercise,
  WritingExercise,
} from "@/types/exercise";

/**
 * Runtime validation for everything the app reads out of `data/`. The
 * hand-written interfaces in `types/deck.ts` stay the source of truth; these
 * schemas mirror them, and the compile-time assertions at the bottom of this
 * file fail the build if the two ever drift.
 *
 * Deliberately strict about the things that silently break the UI (colors,
 * locales, relative paths, revision hashes) and deliberately lax about unknown
 * object keys: the contract says `schemaVersion` is bumped only on breaking
 * changes, so an additive field from a newer pipeline must not break an older
 * client. Unknown keys are stripped, not rejected - the same reason a bank's
 * unknown columns are ignored rather than refused.
 */

/** The only `schemaVersion` this client understands. */
export const DATA_SCHEMA_VERSION = 2;

/**
 * Refuses data from a different contract instead of guessing at it. Typed as
 * `number` rather than a literal so the schema output stays assignable to the
 * interfaces, which declare `schemaVersion: number`.
 */
const schemaVersion = z
  .number()
  .int("schemaVersion must be an integer")
  // The `: boolean` annotation keeps zod's output type `number` (matching the
  // interfaces) instead of letting it narrow to the literal `2`.
  .refine((value): boolean => value === DATA_SCHEMA_VERSION, {
    message: `unsupported schemaVersion: this build understands ${DATA_SCHEMA_VERSION} only`,
  });

/**
 * A revision is the first 12 hex characters of a sha256 over content, e.g.
 * `3ab8f10c92d4`. Checking the shape is worth it because a revision is a cache
 * key: anything that is not a content hash (a number, `null`, a truncated
 * string) would quietly key a deck under a value that never changes, and the
 * app would then serve a stale deck forever.
 */
const contentRevision = z
  .string()
  .regex(/^[0-9a-fA-F]{12}$/, "expected a 12-character hex content revision");

/** `#RRGGBB`, per the data contract. */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "expected a #RRGGBB color");

/**
 * BCP-47 language tag, loose enough for real tags ("nl", "nl-NL",
 * "zh-Hant-TW") and tight enough to catch a label pasted into a locale field.
 */
const locale = z
  .string()
  .regex(
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/,
    "expected a BCP-47 locale tag",
  );

/** Slug-shaped, stable identifier (deck ids and word ids). */
const slugId = z
  .string()
  .min(1, "must not be empty")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected a lowercase slug");

const nonEmptyText = z.string().min(1, "must not be empty");

/** Path relative to `data/`. Never absolute, never escaping the directory. */
const relativeDataPath = z
  .string()
  .min(1, "must not be empty")
  .refine(
    (value) =>
      !value.startsWith("/") && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value),
    {
      message: "must be relative to data/, not absolute",
    },
  )
  .refine((value) => !value.split("/").includes(".."), {
    message: 'must not contain ".."',
  });

const languageInfoSchema = z.object({
  label: nonEmptyText,
  locale,
});

const deckLanguagesSchema = z.object({
  front: languageInfoSchema,
  back: languageInfoSchema,
});

/**
 * One row of a bank, after the TSV has been split into named columns and `tags`
 * has been split on commas. `front` and `back` are checked for presence only:
 * their inline formatting is the renderer's business and can never be invalid
 * (unbalanced markup renders literally, by contract).
 */
export const bankRowSchema = z.object({
  id: slugId,
  front: nonEmptyText,
  back: nonEmptyText,
  // May be empty, never absent.
  tags: z.array(nonEmptyText),
});

const deckSummarySchema = z.object({
  id: slugId,
  name: nonEmptyText,
  color: hexColor,
  languages: deckLanguagesSchema,
  wordCount: z.number().int().nonnegative(),
  revision: contentRevision,
  // Deliberately just a string: the set of renderable icons is a frontend
  // concern, and an unknown name degrades to the fallback icon rather than
  // rejecting the whole manifest.
  icon: nonEmptyText.optional(),
});

/**
 * Exercise items, one schema per set kind. Learner-facing text is plain (no
 * inline markup), but that is a style rule the validator warns about at
 * authoring time — the client checks presence only, same stance as bank rows.
 */
const exerciseTags = z.array(nonEmptyText);

export const grammarExerciseSchema = z
  .object({
    id: slugId,
    prompt: nonEmptyText,
    code: nonEmptyText.optional(),
    choices: z.array(nonEmptyText).min(2),
    codeChoices: z.boolean().optional(),
    answerIndex: z.number().int().nonnegative(),
    explanation: nonEmptyText,
    tags: exerciseTags,
  })
  // Out-of-range would render a question no choice can ever answer correctly.
  .refine((exercise) => exercise.answerIndex < exercise.choices.length, {
    message: "answerIndex must be an index into choices",
  })
  // The runner keys choice buttons by their text, so two identical choices
  // would share React state. The repo validator enforces this too, but this
  // schema is what guards data served from hosts that never ran it.
  .refine(
    (exercise) => new Set(exercise.choices).size === exercise.choices.length,
    { message: "choices must be distinct" },
  );

export const translationExerciseSchema = z.object({
  id: slugId,
  source: nonEmptyText,
  reference: nonEmptyText,
  direction: z.enum(["nl-en", "en-nl"]),
  tags: exerciseTags,
});

export const writingExerciseSchema = z.object({
  id: slugId,
  prompt: nonEmptyText,
  instructions: nonEmptyText,
  example: nonEmptyText,
  tags: exerciseTags,
});

/**
 * Lesson blocks. A discriminated union on `type`, so an unknown block type
 * fails the set at the boundary instead of rendering as a blank gap. Text
 * fields are checked for presence only; their inline markup can never be
 * invalid (unbalanced delimiters render literally, as on cards).
 */
const textBlock = <T extends "heading" | "text" | "rule" | "tip">(type: T) =>
  z.object({ type: z.literal(type), text: nonEmptyText });

const lessonBlockSchema = z
  .discriminatedUnion("type", [
    textBlock("heading"),
    textBlock("text"),
    textBlock("rule"),
    textBlock("tip"),
    z.object({ type: z.literal("list"), items: z.array(nonEmptyText).min(1) }),
    z.object({
      type: z.literal("table"),
      caption: nonEmptyText.optional(),
      headers: z.array(nonEmptyText).min(1),
      rows: z.array(z.array(z.string())).min(1),
    }),
    z.object({
      type: z.literal("examples"),
      items: z
        .array(
          z.object({
            nl: nonEmptyText,
            en: nonEmptyText,
            note: nonEmptyText.optional(),
          }),
        )
        .min(1),
    }),
    z.object({
      type: z.literal("mistake"),
      wrong: nonEmptyText,
      right: nonEmptyText,
      why: nonEmptyText,
    }),
    z.object({
      type: z.literal("code"),
      caption: nonEmptyText.optional(),
      code: nonEmptyText,
      output: nonEmptyText.optional(),
    }),
    z.object({
      type: z.literal("bug"),
      wrong: nonEmptyText,
      right: nonEmptyText,
      why: nonEmptyText,
    }),
  ])
  // Checked on the union because zod's discriminated union only takes plain
  // objects. A short row would shift every cell after the gap into the wrong
  // column.
  .superRefine((block, ctx) => {
    if (
      block.type === "table" &&
      !block.rows.every((row) => row.length === block.headers.length)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "every table row must have one cell per header",
        path: ["rows"],
      });
    }
  });

/**
 * Coding labs. Structure only: whether a solution really passes its tests is
 * proven at authoring time by tools/course-check, which runs every step.
 */
const labTestSchema = z.object({
  name: nonEmptyText,
  code: nonEmptyText,
  fail: nonEmptyText,
  inputs: z.array(z.string()).optional(),
});

const labStepSchema = z.object({
  id: slugId,
  mode: z.enum(["guided", "change", "write", "challenge"]),
  title: nonEmptyText,
  instructions: nonEmptyText,
  guide: z
    .array(z.object({ code: nonEmptyText, explain: nonEmptyText }))
    .min(1)
    .optional(),
  starter: z.string().optional(),
  carryOver: z.boolean().optional(),
  inputs: z.array(z.string()).optional(),
  hints: z.array(nonEmptyText).optional(),
  solution: nonEmptyText,
  tests: z.array(labTestSchema).min(1),
});

export const codingLabSchema = z.object({
  id: slugId,
  lesson: slugId,
  title: nonEmptyText,
  summary: nonEmptyText,
  steps: z.array(labStepSchema).min(1),
});

export const grammarLessonSchema = z.object({
  id: slugId,
  title: nonEmptyText,
  summary: nonEmptyText,
  blocks: z.array(lessonBlockSchema).min(1),
});

/**
 * The shape of `exercises/<id>.json`, by set kind. The kind itself lives in
 * `library.json` (and so in the manifest entry), never in the file, so the
 * caller picks the schema from the summary it already holds.
 */
export const exerciseFileSchemas = {
  grammar: z.object({
    schemaVersion,
    // Optional in the file, always an array in the app: a set without lessons
    // is the plain quiz it was before lessons existed.
    lessons: z.array(grammarLessonSchema).default([]),
    exercises: z.array(grammarExerciseSchema),
    labs: z.array(codingLabSchema).default([]),
  }),
  translation: z.object({
    schemaVersion,
    exercises: z.array(translationExerciseSchema),
  }),
  writing: z.object({
    schemaVersion,
    exercises: z.array(writingExerciseSchema),
  }),
} as const;

const exerciseSetSummarySchema = z.object({
  id: slugId,
  name: nonEmptyText,
  kind: z.enum(["grammar", "translation", "writing"]),
  level: nonEmptyText.optional(),
  course: nonEmptyText.optional(),
  color: hexColor,
  revision: contentRevision,
  exerciseCount: z.number().int().nonnegative(),
  lessonCount: z.number().int().positive().optional(),
  labCount: z.number().int().positive().optional(),
  // Same stance as a deck's icon: any string, unknown names fall back.
  icon: nonEmptyText.optional(),
});

export const manifestSchema = z.object({
  schemaVersion,
  decks: z.array(deckSummarySchema),
  // Optional: absent from manifests generated before exercise sets existed.
  exerciseSets: z.array(exerciseSetSummarySchema).optional(),
});

const audioClipSchema = z.object({
  path: relativeDataPath,
  bytes: z.number().int().nonnegative(),
});

export const audioIndexSchema = z.object({
  schemaVersion,
  // locale -> voice name
  voices: z.record(z.string(), nonEmptyText),
  // `${locale}:${strippedText}` -> clip
  clips: z.record(z.string(), audioClipSchema),
});

/**
 * A whole assembled deck. Not applied at runtime - `parseBank` validates row by
 * row so that a bad row can be reported with its line number, and the rest of
 * the deck comes from an already-validated manifest entry. It exists so that
 * `Deck` is covered by the drift assertions below like every other shape.
 */
const deckSchema = z.object({
  schemaVersion,
  id: slugId,
  name: nonEmptyText,
  color: hexColor,
  revision: contentRevision,
  languages: deckLanguagesSchema,
  words: z.array(bankRowSchema),
});

/**
 * Compile-time proof that each schema produces exactly its interface. If a
 * schema gains, loses or retypes a field without the interface following (or
 * vice versa), one of these aliases stops satisfying `Expect<true>` and tsc
 * fails here rather than somewhere three components deep.
 */
type Extends<A, B> = [A] extends [B] ? true : false;
type Mutual<A, B> = Extends<A, B> extends true ? Extends<B, A> : false;
type Expect<T extends true> = T;

export type LanguageInfoSchemaMatches = Expect<
  Mutual<z.output<typeof languageInfoSchema>, LanguageInfo>
>;
export type DeckLanguagesSchemaMatches = Expect<
  Mutual<z.output<typeof deckLanguagesSchema>, DeckLanguages>
>;
export type BankRowSchemaMatches = Expect<
  Mutual<z.output<typeof bankRowSchema>, Word>
>;
export type DeckSchemaMatches = Expect<
  Mutual<z.output<typeof deckSchema>, Deck>
>;
export type DeckSummarySchemaMatches = Expect<
  Mutual<z.output<typeof deckSummarySchema>, DeckSummary>
>;
export type ManifestSchemaMatches = Expect<
  Mutual<z.output<typeof manifestSchema>, Manifest>
>;
export type AudioClipSchemaMatches = Expect<
  Mutual<z.output<typeof audioClipSchema>, AudioClip>
>;
export type AudioIndexSchemaMatches = Expect<
  Mutual<z.output<typeof audioIndexSchema>, AudioIndex>
>;
export type GrammarExerciseSchemaMatches = Expect<
  Mutual<z.output<typeof grammarExerciseSchema>, GrammarExercise>
>;
export type TranslationExerciseSchemaMatches = Expect<
  Mutual<z.output<typeof translationExerciseSchema>, TranslationExercise>
>;
export type WritingExerciseSchemaMatches = Expect<
  Mutual<z.output<typeof writingExerciseSchema>, WritingExercise>
>;
export type LessonBlockSchemaMatches = Expect<
  Mutual<z.output<typeof lessonBlockSchema>, LessonBlock>
>;
export type CodingLabSchemaMatches = Expect<
  Mutual<z.output<typeof codingLabSchema>, CodingLab>
>;
export type GrammarLessonSchemaMatches = Expect<
  Mutual<z.output<typeof grammarLessonSchema>, GrammarLesson>
>;
export type ExerciseSetSummarySchemaMatches = Expect<
  Mutual<z.output<typeof exerciseSetSummarySchema>, ExerciseSetSummary>
>;

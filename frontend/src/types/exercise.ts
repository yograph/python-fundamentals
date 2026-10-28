/**
 * Exercise sets: grammar questions, translations and writing prompts. See
 * `docs/DATA_CONTRACT.md` — like decks, a set is metadata in the manifest plus
 * items from its own authored file (`exercises/<id>.json`), and `ExerciseSet`
 * is what the data layer assembles from the two.
 *
 * Unlike a word's id, an exercise's id is not derived from its text: exercises
 * get reworded in place, so the id is simply a stable slug chosen at authoring
 * time. It is still the key progress is stored under and must never be
 * reassigned.
 */

export type ExerciseKind = "grammar" | "translation" | "writing";

/** A multiple-choice grammar question. Exactly one choice is correct. */
export interface GrammarExercise {
  id: string;
  /** The question or a fill-in-the-blank sentence, with `___` for the gap. */
  prompt: string;
  /**
   * A code snippet shown under the prompt, verbatim in a monospace box. Never
   * parsed as markup: `**` and `__` are everyday Python.
   */
  code?: string;
  choices: string[];
  /** Choices are code or program output: monospace, line breaks kept. */
  codeChoices?: boolean;
  /** 0-based index into `choices`. */
  answerIndex: number;
  explanation: string;
  tags: string[];
}

/**
 * Grammar lessons: the explanation a grammar set's exercises drill. A lesson is
 * an ordered list of blocks rather than one markdown string, so the renderer
 * stays a closed set of React components with no HTML anywhere — the same
 * stance as card text. Every string inside a block may carry the card markup
 * subset (`**bold**`, `*italic*`, `__underline__`); `title` and `summary` are
 * plain.
 *
 * An exercise belongs to the lesson whose `id` appears in its `tags`.
 */
export interface LessonExample {
  /** Dutch sentence. Voiced with the Dutch locale. */
  nl: string;
  en: string;
  note?: string;
}

export type LessonBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "rule"; text: string }
  | { type: "tip"; text: string }
  | { type: "list"; items: string[] }
  | {
      type: "table";
      caption?: string;
      headers: string[];
      rows: string[][];
    }
  | { type: "examples"; items: LessonExample[] }
  | { type: "mistake"; wrong: string; right: string; why: string }
  /** `code` and `output` are shown verbatim; only `caption` carries markup. */
  | { type: "code"; caption?: string; code: string; output?: string }
  /** A coding mistake: `wrong` and `right` are code, `why` carries markup. */
  | { type: "bug"; wrong: string; right: string; why: string };

export type LessonBlockType = LessonBlock["type"];

export interface GrammarLesson {
  id: string;
  title: string;
  /** One sentence: what the learner can do after the lesson. */
  summary: string;
  blocks: LessonBlock[];
}

/** A sentence to translate; the learner self-checks against `reference`. */
export interface TranslationExercise {
  id: string;
  source: string;
  reference: string;
  /** `nl-en` when `source` is Dutch, `en-nl` when it is English. */
  direction: "nl-en" | "en-nl";
  tags: string[];
}

/** A free-writing prompt; the learner self-checks against `example`. */
export interface WritingExercise {
  id: string;
  prompt: string;
  instructions: string;
  /** A model answer in Dutch. May contain newlines between sentences. */
  example: string;
  tags: string[];
}

/** Manifest entry for a set: everything the overview needs before loading it. */
export interface ExerciseSetSummary {
  id: string;
  name: string;
  kind: ExerciseKind;
  /** Optional CEFR-ish label ("A1"), shown as a subtitle. */
  level?: string;
  /**
   * Optional course name ("Python fundamentals"). Sets sharing one get their
   * own overview section under that heading; sets without one stay in the
   * Grammar course or Practice sections.
   */
  course?: string;
  color: string;
  /** Content hash of the set file (12 hex chars). Doubles as the cache key. */
  revision: string;
  exerciseCount: number;
  /**
   * Grammar sets only, and only when the set file carries lessons: present
   * means the set is a course, shown with its lessons rather than as a bare
   * quiz.
   */
  lessonCount?: number;
  icon?: string;
}

interface ExerciseSetBase {
  schemaVersion: number;
  id: string;
  name: string;
  level?: string;
  color: string;
  revision: string;
}

export interface GrammarSet extends ExerciseSetBase {
  kind: "grammar";
  /** Empty when the set file has none: the set is then a plain quiz. */
  lessons: GrammarLesson[];
  exercises: GrammarExercise[];
}

export interface TranslationSet extends ExerciseSetBase {
  kind: "translation";
  exercises: TranslationExercise[];
}

export interface WritingSet extends ExerciseSetBase {
  kind: "writing";
  exercises: WritingExercise[];
}

/**
 * A fully loaded set. Discriminated on `kind`, so narrowing the set also
 * narrows its `exercises` — the practice UI never has to cast an item.
 */
export type ExerciseSet = GrammarSet | TranslationSet | WritingSet;

import type { LabTest } from "@/types/exercise";

/**
 * The messages between the page and the Python worker. Results mirror what
 * `harness.py` returns, field for field.
 */

export interface PythonError {
  type: string;
  message: string;
  /** Line in the learner's code, when the error came from it. */
  line: number | null;
}

export interface RunResult {
  /** What the learner sees: printed text, input prompts and typed input. */
  output: string;
  /** print() output only. */
  printed: string;
  error: PythonError | null;
}

export interface TestResult {
  name: string;
  passed: boolean;
  /** The test's `fail` text, when it failed. */
  message?: string;
  /** Set when the program or the test crashed rather than an assert failing. */
  error?: PythonError;
}

export type WorkerRequest =
  | { id: number; kind: "boot" }
  | { id: number; kind: "run"; source: string; inputs: string[] }
  | {
      id: number;
      kind: "test";
      source: string;
      inputs: string[];
      tests: LabTest[];
    };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; message: string };

import { useCallback, useSyncExternalStore } from "react";

import type { LabTest } from "@/types/exercise";
import type {
  RunResult,
  TestResult,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

/**
 * The page's side of the Python worker: one worker for the whole app, booted
 * on first use, and replaced whenever a run overstays its time limit.
 *
 * Time limits start only once Python is ready, so a slow first download is
 * never mistaken for a learner's infinite loop.
 */

export type PythonStatus = "idle" | "loading" | "ready" | "running" | "failed";

export type Outcome<T> =
  | { status: "done"; result: T }
  | { status: "timeout"; seconds: number }
  | { status: "failed"; message: string };

const RUN_LIMIT_MS = 5_000;
// A check runs the program once per test, so it gets more room.
const TEST_LIMIT_MS = 10_000;

type Pending = {
  resolve: (response: WorkerResponse) => void;
};

type Distribute<T> = T extends unknown ? Omit<T, "id"> : never;

class PythonRunner {
  private worker: Worker | null = null;
  private booting: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<() => void>();
  status: PythonStatus = "idle";

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = () => this.status;

  private setStatus(status: PythonStatus) {
    this.status = status;
    for (const listener of this.listeners) listener();
  }

  private spawn(): Worker {
    const worker = new Worker(new URL("./python-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const entry = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      entry?.resolve(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.discard(event.message || "The Python worker crashed.");
    };
    return worker;
  }

  /** Throws the worker away, failing whatever was waiting on it. */
  private discard(message: string) {
    this.worker?.terminate();
    this.worker = null;
    this.booting = null;
    for (const [id, entry] of this.pending) {
      entry.resolve({ id, ok: false, message });
    }
    this.pending.clear();
  }

  private send(request: Distribute<WorkerRequest>): Promise<WorkerResponse> {
    this.worker ??= this.spawn();
    const id = this.nextId++;
    const worker = this.worker;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      worker.postMessage({ ...request, id } as WorkerRequest);
    });
  }

  /** Loads Python if it is not loaded yet. Safe to call repeatedly. */
  boot(): Promise<void> {
    this.booting ??= (async () => {
      this.setStatus("loading");
      const response = await this.send({ kind: "boot" });
      if (!response.ok) {
        this.discard(response.message);
        this.setStatus("failed");
        throw new Error(response.message);
      }
      this.setStatus("ready");
    })();
    return this.booting;
  }

  private async execute<T>(
    request: Distribute<WorkerRequest>,
    limitMs: number,
  ): Promise<Outcome<T>> {
    try {
      await this.boot();
    } catch (error) {
      return {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    this.setStatus("running");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), limitMs);
    });
    const response = await Promise.race([this.send(request), timedOut]);
    clearTimeout(timer);

    if (response === "timeout") {
      // The only way to stop a running Python program is to end its worker.
      this.discard("Stopped: the program ran too long.");
      this.setStatus("idle");
      return { status: "timeout", seconds: limitMs / 1000 };
    }
    this.setStatus("ready");
    return response.ok
      ? { status: "done", result: response.result as T }
      : { status: "failed", message: response.message };
  }

  run(source: string, inputs: string[]): Promise<Outcome<RunResult>> {
    return this.execute({ kind: "run", source, inputs }, RUN_LIMIT_MS);
  }

  test(
    source: string,
    tests: LabTest[],
    inputs: string[],
  ): Promise<Outcome<TestResult[]>> {
    return this.execute({ kind: "test", source, tests, inputs }, TEST_LIMIT_MS);
  }
}

const runner = new PythonRunner();

/** The shared Python runner, with its status as React state. */
export function usePython() {
  const status = useSyncExternalStore(runner.subscribe, runner.getStatus);
  const preload = useCallback(() => {
    void runner.boot().catch(() => {
      // Reported through `status`; the next run retries.
    });
  }, []);
  const run = useCallback(
    (source: string, inputs: string[]) => runner.run(source, inputs),
    [],
  );
  const test = useCallback(
    (source: string, tests: LabTest[], inputs: string[]) =>
      runner.test(source, tests, inputs),
    [],
  );
  return { status, preload, run, test };
}

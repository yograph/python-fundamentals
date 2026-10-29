import HARNESS from "./harness.py?raw";
import type { WorkerRequest, WorkerResponse } from "./protocol";

/**
 * Runs Python off the main thread. Pyodide (CPython compiled to WebAssembly)
 * loads from the jsDelivr CDN on first use, roughly 10 MB once and from the
 * HTTP cache after that. A worker, so that a learner's infinite loop can be
 * stopped: the page terminates it on a timeout (see python-runner.ts).
 *
 * Pinned to the Pyodide release built on Python 3.13, the version
 * tools/course-check and CI verify every lab with.
 */
const PYODIDE_VERSION = "0.29.5";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

interface PyCallable {
  (...args: string[]): string;
  destroy(): void;
}

interface Pyodide {
  runPython(code: string): unknown;
  globals: { get(name: string): PyCallable };
}

// Typed by hand rather than via the "webworker" lib, which clashes with the
// DOM lib the rest of the app compiles against.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

let pyodide: Promise<Pyodide> | null = null;

function boot(): Promise<Pyodide> {
  pyodide ??= (async () => {
    const { loadPyodide } = (await import(
      /* @vite-ignore */ `${INDEX_URL}pyodide.mjs`
    )) as {
      loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
    };
    const instance = await loadPyodide({ indexURL: INDEX_URL });
    instance.runPython(HARNESS);
    return instance;
  })();
  return pyodide;
}

/** Calls one of the harness's JSON entry points and parses its answer. */
function callHarness(instance: Pyodide, name: string, args: string[]) {
  const entry = instance.globals.get(name);
  try {
    return JSON.parse(entry(...args)) as unknown;
  } finally {
    entry.destroy();
  }
}

scope.onmessage = async (event) => {
  const request = event.data;
  try {
    const instance = await boot();
    let result: unknown = null;
    if (request.kind === "run") {
      result = callHarness(instance, "run_program_json", [
        request.source,
        JSON.stringify(request.inputs),
      ]);
    } else if (request.kind === "test") {
      result = callHarness(instance, "run_tests_json", [
        request.source,
        JSON.stringify(request.tests),
        JSON.stringify(request.inputs),
      ]);
    }
    scope.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    // A failed boot must be retryable, not cached forever.
    if (request.kind === "boot") pyodide = null;
    scope.postMessage({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

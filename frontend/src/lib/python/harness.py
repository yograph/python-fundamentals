"""Run a learner's program, and the tests of a coding-lab step.

One file, two runtimes. The browser loads it into Pyodide inside a Web Worker
(see python-worker.ts), and tools/course-check imports it under CPython to
prove every lab's solution passes its own tests. So a test that passes in the
checker passes in the app, and the other way round.

Everything crosses the JS boundary as JSON strings: run_program_json and
run_tests_json are the only entry points the worker calls.

A test is {"name", "code", "fail", "inputs"?}. Each test runs the learner's
program afresh (with the test's typed inputs, else the step's), then runs
`code` in the program's namespace, so it can call the learner's functions.
A test passes when its code raises nothing. These names are also in scope:

    OUT       everything print() wrote (input prompts not included)
    LINES     OUT split into lines, trailing spaces removed
    SOURCE    the learner's code as text
    uses(kind)          an AST node of that kind exists: uses("For"), uses("While")
    calls(name)         a call to name(...) or x.name(...) exists
    defines(name)       a function called name is defined
    is_recursive(name)  the function name calls itself
    output_of(f, *args) what calling f(*args) prints
    run_source(code, inputs=())  what another program prints, e.g. SOURCE with
                        its list swapped, to prove nothing is hard-coded;
                        raises RuntimeError if that program crashes
"""

import ast
import builtins
import io
import json
import sys
import traceback

FILENAME = "<your code>"
MAX_OUTPUT = 50_000


class OutputLimit(BaseException):
    """A program printed far too much: almost always a loop that never stops.

    A BaseException, so a learner's `except Exception` cannot swallow it.
    """


class _Stdout:
    """sys.stdout during a run. print() output goes to both buffers."""

    def __init__(self):
        self.printed = io.StringIO()  # what tests see
        self.transcript = io.StringIO()  # what the learner sees: with prompts and typed text

    def write(self, text):
        if self.transcript.tell() > MAX_OUTPUT:
            raise OutputLimit()
        self.printed.write(text)
        self.transcript.write(text)
        return len(text)

    def flush(self):
        pass


def _describe_error(exc):
    """The error's type and message, and the line of the learner's code it came from."""
    if isinstance(exc, OutputLimit):
        return {
            "type": "TooMuchOutput",
            "message": "the program printed far too much; is there a loop that never stops?",
            "line": None,
        }
    line = None
    if isinstance(exc, SyntaxError) and exc.filename == FILENAME:
        line = exc.lineno
    else:
        for frame in traceback.extract_tb(exc.__traceback__):
            if frame.filename == FILENAME:
                line = frame.lineno
    return {"type": type(exc).__name__, "message": str(exc), "line": line}


def run_program(source, inputs=()):
    """Run source as a fresh program. Returns (result, namespace)."""
    stdout = _Stdout()
    typed = [str(value) for value in inputs]

    def fake_input(prompt=""):
        prompt = str(prompt)
        stdout.transcript.write(prompt)
        if not typed:
            raise EOFError("input() was called, but there is no more typed input")
        value = typed.pop(0)
        stdout.transcript.write(value + "\n")
        return value

    # input lives in the program's own globals, so nothing global is patched.
    namespace = {"__name__": "__main__", "__builtins__": builtins, "input": fake_input}
    error = None
    saved = sys.stdout
    sys.stdout = stdout
    try:
        exec(compile(source, FILENAME, "exec"), namespace)
    except BaseException as exc:  # SystemExit too: exit() must not end the runner
        error = _describe_error(exc)
    finally:
        sys.stdout = saved
    result = {
        "output": stdout.transcript.getvalue(),
        "printed": stdout.printed.getvalue(),
        "error": error,
    }
    return result, namespace


def _helpers(source, printed):
    try:
        nodes = list(ast.walk(ast.parse(source)))
    except SyntaxError:
        nodes = []

    def uses(kind):
        return any(type(node).__name__ == kind for node in nodes)

    def _call_name(node):
        if isinstance(node.func, ast.Name):
            return node.func.id
        if isinstance(node.func, ast.Attribute):
            return node.func.attr
        return None

    def calls(name):
        return any(isinstance(n, ast.Call) and _call_name(n) == name for n in nodes)

    def defines(name):
        return any(isinstance(n, ast.FunctionDef) and n.name == name for n in nodes)

    def is_recursive(name):
        for node in nodes:
            if isinstance(node, ast.FunctionDef) and node.name == name:
                return any(
                    isinstance(inner, ast.Call)
                    and isinstance(inner.func, ast.Name)
                    and inner.func.id == name
                    for inner in ast.walk(node)
                )
        return False

    def output_of(function, *args, **kwargs):
        capture = io.StringIO()
        saved = sys.stdout
        sys.stdout = capture
        try:
            function(*args, **kwargs)
        finally:
            sys.stdout = saved
        return capture.getvalue()

    def run_source(code, inputs=()):
        result, _ = run_program(code, inputs)
        if result["error"]:
            error = result["error"]
            raise RuntimeError(f"{error['type']}: {error['message']}")
        return result["printed"]

    return {
        "OUT": printed,
        "LINES": [line.rstrip() for line in printed.strip("\n").splitlines()],
        "SOURCE": source,
        "uses": uses,
        "calls": calls,
        "defines": defines,
        "is_recursive": is_recursive,
        "output_of": output_of,
        "run_source": run_source,
    }


def run_tests(source, tests, default_inputs=()):
    """Run every test. Returns one {"name", "passed", "message"?, "error"?} per test."""
    results = []
    for test in tests:
        name = test.get("name", "")
        run, namespace = run_program(source, test.get("inputs", default_inputs))
        if run["error"]:
            results.append(
                {"name": name, "passed": False, "message": test["fail"], "error": run["error"]}
            )
            continue
        namespace.update(_helpers(source, run["printed"]))
        saved = sys.stdout
        sys.stdout = _Stdout()  # a learner's function may print while a test calls it
        try:
            exec(compile(test["code"], "<test>", "exec"), namespace)
            results.append({"name": name, "passed": True})
        except AssertionError:
            results.append({"name": name, "passed": False, "message": test["fail"]})
        except BaseException as exc:
            results.append(
                {"name": name, "passed": False, "message": test["fail"], "error": _describe_error(exc)}
            )
        finally:
            sys.stdout = saved
    return results


def run_program_json(source, inputs_json):
    result, _ = run_program(source, json.loads(inputs_json))
    return json.dumps(result)


def run_tests_json(source, tests_json, inputs_json):
    return json.dumps(run_tests(source, json.loads(tests_json), json.loads(inputs_json)))

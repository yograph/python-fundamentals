#!/usr/bin/env python3
"""Verify the coding labs of a set file by running them.

    python3 tools/course-check/check_labs.py data/exercises/<setId>.json [...]
    python3 tools/course-check/check_labs.py --lessons a,b,c labs-draft.json

A file may be a whole set file (labs are checked against its lessons) or a
draft holding only {"labs": [...]}, with --lessons naming the lesson ids the
labs may point at. Files without labs are skipped.

Each step is run through frontend/src/lib/python/harness.py, the same code
the browser uses, and must satisfy:

  - its solution passes every test, and runs cleanly with the step's inputs;
  - a guided step's guide pieces, joined with newlines, are its solution;
  - the step is not already solved when it opens: the starter code, or the
    previous step's solution for a carryOver step, or an empty editor, fails
    at least one test.
"""

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

HARNESS_DIR = Path(__file__).resolve().parents[2] / "frontend/src/lib/python"
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MODES = {"guided", "change", "write", "challenge"}

RUNNER = r"""
import json, sys
sys.path.insert(0, sys.argv[1])
import harness
job = json.loads(sys.stdin.read())
if job["kind"] == "run":
    print(harness.run_program_json(job["source"], json.dumps(job["inputs"])))
else:
    print(harness.run_tests_json(job["source"], json.dumps(job["tests"]), json.dumps(job["inputs"])))
"""

errors: list[str] = []
warnings: list[str] = []


def call(kind, source, tests=(), inputs=()):
    job = json.dumps({"kind": kind, "source": source, "tests": list(tests), "inputs": list(inputs)})
    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-c", RUNNER, str(HARNESS_DIR)],
            input=job, capture_output=True, text=True, timeout=10,
        )
    except subprocess.TimeoutExpired:
        return None
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-800:])
    return json.loads(proc.stdout.strip().splitlines()[-1])


def lint_rich(at, text):
    """Rich text (instructions, hints, explanations): only **bold** unescaped."""
    stripped = text.replace("\\\\", "").replace("\\*", "").replace("\\_", "")
    stripped = re.sub(r"\*\*[^*]+?\*\*", "", stripped)
    if "*" in stripped:
        errors.append(f"{at}: literal * must be written \\* in rich text: {text!r}")
    if "__" in stripped:
        errors.append(f"{at}: literal __ must be written \\_\\_ in rich text: {text!r}")
    if "`" in text:
        warnings.append(f"{at}: backticks render literally (use **bold**): {text!r}")


def lint_plain(at, text):
    if "**" in text or "`" in text or "\\*" in text:
        errors.append(f"{at}: plain text, no markup, backticks or escapes: {text!r}")


def failing(results):
    return [r for r in results if not r["passed"]]


def check_file(path: Path, lesson_ids: set[str] | None) -> int:
    data = json.loads(path.read_text())
    labs = data.get("labs")
    if not labs:
        return 0
    if lesson_ids is None:
        lesson_ids = {lesson["id"] for lesson in data.get("lessons", [])}
    seen_labs = set()
    per_lesson = Counter()
    step_count = 0
    modes = Counter()
    for li, lab in enumerate(labs):
        at = f"{path.name} labs[{li}] ({lab.get('id')})"
        if not SLUG.match(lab.get("id", "")) or lab["id"] in seen_labs:
            errors.append(f"{at}: id must be a unique lowercase slug")
        seen_labs.add(lab.get("id"))
        if lab.get("lesson") not in lesson_ids:
            errors.append(f"{at}: lesson {lab.get('lesson')!r} is not a lesson id of this set")
        per_lesson[lab.get("lesson")] += 1
        for field in ("title", "summary"):
            if not lab.get(field):
                errors.append(f"{at}: missing {field}")
            else:
                lint_plain(f"{at} {field}", lab[field])
        steps = lab.get("steps", [])
        if len(steps) < 3:
            errors.append(f"{at}: needs at least 3 steps")
        seen_steps = set()
        previous_solution = None
        for si, step in enumerate(steps):
            sat = f"{at} steps[{si}] ({step.get('id')})"
            step_count += 1
            if not SLUG.match(step.get("id", "")) or step["id"] in seen_steps:
                errors.append(f"{sat}: id must be a unique lowercase slug within the lab")
            seen_steps.add(step.get("id"))
            mode = step.get("mode")
            modes[mode] += 1
            if mode not in MODES:
                errors.append(f"{sat}: mode must be one of {sorted(MODES)}")
            if not step.get("title"):
                errors.append(f"{sat}: missing title")
            else:
                lint_plain(f"{sat} title", step["title"])
            if not step.get("instructions"):
                errors.append(f"{sat}: missing instructions")
            else:
                lint_rich(f"{sat} instructions", step["instructions"])
            for hint in step.get("hints", []):
                lint_rich(f"{sat} hint", hint)
            if mode in ("write", "challenge") and not step.get("hints"):
                errors.append(f"{sat}: {mode} steps need at least one hint")
            solution = step.get("solution", "")
            if not solution.strip():
                errors.append(f"{sat}: missing solution")
                continue
            if "guide" in step:
                if mode != "guided":
                    errors.append(f"{sat}: only guided steps have a guide")
                pieces = step["guide"]
                if not pieces or not all(p.get("code") and p.get("explain") for p in pieces):
                    errors.append(f"{sat}: guide pieces need code and explain")
                else:
                    for piece in pieces:
                        lint_rich(f"{sat} guide", piece["explain"])
                    if "\n".join(p["code"] for p in pieces) != solution:
                        errors.append(f"{sat}: guide pieces joined with newlines must equal the solution")
            elif mode == "guided":
                errors.append(f"{sat}: guided steps need a guide")
            if step.get("carryOver") and si == 0:
                errors.append(f"{sat}: the first step cannot carry over")
            if step.get("carryOver") and "starter" in step:
                errors.append(f"{sat}: carryOver and starter are exclusive")
            inputs = step.get("inputs", [])
            if not isinstance(inputs, list) or not all(isinstance(x, str) for x in inputs):
                errors.append(f"{sat}: inputs must be a list of strings")
                inputs = []
            tests = step.get("tests", [])
            if not tests:
                errors.append(f"{sat}: needs at least one test")
                continue
            for ti, test in enumerate(tests):
                if not (test.get("name") and test.get("code") and test.get("fail")):
                    errors.append(f"{sat} tests[{ti}]: needs name, code and fail")
                else:
                    lint_plain(f"{sat} tests[{ti}] name", test["name"])
                    lint_plain(f"{sat} tests[{ti}] fail", test["fail"])

            results = call("tests", solution, tests, inputs)
            if results is None:
                errors.append(f"{sat}: solution timed out under its tests")
            else:
                for r in failing(results):
                    errors.append(f"{sat}: solution FAILS test {r['name']!r}: {r.get('error') or r['message']}")
            run = call("run", solution, inputs=inputs)
            if run is None or run["error"]:
                errors.append(f"{sat}: solution does not run cleanly with the step's inputs: {run and run['error']}")

            if step.get("carryOver"):
                opening, label = previous_solution or "", "the previous step's solution"
            else:
                opening, label = step.get("starter", ""), "the starter code" if "starter" in step else "an empty editor"
            opened = call("tests", opening, tests, inputs)
            if opened is not None and not failing(opened):
                errors.append(f"{sat}: already solved when it opens: {label} passes every test")
            previous_solution = solution

    for lesson in sorted(lesson_ids - set(per_lesson)):
        warnings.append(f"{path.name}: lesson {lesson} has no lab")
    print(f"{path.name}: {len(labs)} labs, {step_count} steps, modes {dict(modes)}")
    return len(labs)


def main():
    args = sys.argv[1:]
    lesson_ids = None
    if args[:1] == ["--lessons"]:
        lesson_ids = set(args[1].split(","))
        args = args[2:]
    for name in args:
        check_file(Path(name), lesson_ids)
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print("OK" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

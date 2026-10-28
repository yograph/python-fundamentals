#!/usr/bin/env python3
"""Verify a Python-course exercise file by actually running its code.

    python3 tools/course-check/check_course.py \
        data/exercises/<setId>.json tools/course-check/checks/<setId>.json

(or `pnpm course:check` for every set that has a checks file)

The checks file maps exercise id -> Python test code (asserts). The test runs in the
same namespace as the exercise code, after it, with OUT = everything the code
printed. Required for every `correct-or-wrong` exercise; optional for `fill-in`
and `fix` (then the right choice must pass and every other choice must fail).

Style tags (each exercise has exactly one):
  concept           no code needs running
  output            run `code`; the answer must be exactly what it prints, or
                    name the exception it raises, or say "never stops"
  correct-or-wrong  choices are exactly ["Correct", "Wrong"]; verdict comes
                    from running code + check
  fill-in           `code` contains ___ ; choices fill it
  fix               choices are replacement code (or fill ___)

Input: a line containing `# the user types X` feeds X to the next input() call.
"""

import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

STYLE_TAGS = {"concept", "output", "correct-or-wrong", "fill-in", "fix"}
BLOCK_TYPES = {"heading", "text", "rule", "tip", "list", "table", "code", "bug"}
SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
TYPED = re.compile(r"#\s*the user types\s*:?\s*(.*?)\s*$", re.IGNORECASE)

HARNESS = r'''
import builtins, io, json, sys
payload = json.loads(sys.stdin.read())
real_stdout = sys.stdout
class OutputLimit(BaseException):
    pass
class Capped(io.StringIO):
    def write(self, s):
        if self.tell() > 200_000:
            raise OutputLimit()
        return super().write(s)
buf = Capped()
inputs = list(payload["inputs"])
def fake_input(prompt=""):
    if not inputs:
        raise EOFError("no more typed input")
    return inputs.pop(0)
builtins.input = fake_input
ns = {"__name__": "__main__"}
result = {"exc": None, "msg": None, "overflow": False, "check": None}
sys.stdout = buf
try:
    exec(compile(payload["code"], "<exercise>", "exec"), ns)
except OutputLimit:
    result["overflow"] = True
except BaseException as e:
    result["exc"] = type(e).__name__
    result["msg"] = str(e)[:200]
finally:
    sys.stdout = real_stdout
result["out"] = buf.getvalue()[:5000]
if payload.get("check") is not None:
    ns["OUT"] = buf.getvalue()
    sys.stdout = io.StringIO()
    try:
        if result["exc"] or result["overflow"]:
            raise AssertionError("code itself failed")
        exec(compile(payload["check"], "<check>", "exec"), ns)
        result["check"] = "pass"
    except BaseException as e:
        result["check"] = "fail: " + type(e).__name__ + " " + str(e)[:120]
    finally:
        sys.stdout = real_stdout
print(json.dumps(result))
'''

errors: list[str] = []
warnings: list[str] = []


def run(code: str, check: str | None = None) -> dict:
    inputs = [m.group(1) for line in code.splitlines() if (m := TYPED.search(line))]
    payload = json.dumps({"code": code, "check": check, "inputs": inputs})
    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-c", HARNESS],
            input=payload, capture_output=True, text=True, timeout=4,
        )
    except subprocess.TimeoutExpired:
        return {"timeout": True}
    if proc.returncode != 0 or not proc.stdout.strip():
        return {"harness_error": proc.stderr[-500:]}
    result = json.loads(proc.stdout.strip().splitlines()[-1])
    result["timeout"] = result.pop("overflow")
    return result


def norm(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.strip("\n").splitlines()).strip()


def describe(result: dict) -> str:
    if result.get("timeout"):
        return "<never stops>"
    if result.get("harness_error"):
        return "<harness error> " + result["harness_error"]
    if result.get("exc"):
        return f"{norm(result['out'])!r} then {result['exc']}: {result['msg']}"
    return repr(norm(result["out"]))


def matches(result: dict, choice: str) -> bool:
    """Does a choice correctly describe what the code did?"""
    if result.get("timeout"):
        low = choice.lower()
        return "never stops" in low or "infinite" in low
    if result.get("harness_error"):
        return False
    if result.get("exc"):
        return result["exc"] in choice
    return norm(result["out"]) == norm(choice)


def lint_lesson_text(at: str, text: str) -> None:
    """Lesson text is parsed as markup: only **bold** may appear unescaped."""
    stripped = text.replace("\\\\", "").replace("\\*", "").replace("\\_", "")
    stripped = re.sub(r"\*\*[^*]+?\*\*", "", stripped)
    if "*" in stripped:
        errors.append(f"{at}: literal * must be written \\* in lesson text: {text!r}")
    if "__" in stripped:
        errors.append(f"{at}: literal __ must be written \\_\\_ in lesson text: {text!r}")
    if "`" in text:
        warnings.append(f"{at}: backticks render literally (use **bold** for code names): {text!r}")


def lint_plain(at: str, text: str) -> None:
    """Exercise text renders plain: escapes would show, markup-looking text warns."""
    if "\\*" in text or "\\_" in text:
        errors.append(f"{at}: exercise text is plain; remove the backslash escape: {text!r}")
    if "**" in text or text.count("*") >= 2 or "__" in text:
        warnings.append(f"{at}: looks like markup to the repo validator (warning only): {text!r}")
    if "`" in text:
        warnings.append(f"{at}: backticks render literally: {text!r}")


def main() -> None:
    path = Path(sys.argv[1])
    checks = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 else {}
    raw = path.read_text()
    data = json.loads(raw)
    expected_bytes = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if raw != expected_bytes:
        warnings.append("file is not json.dumps(indent=2, ensure_ascii=False) + newline")
    if data.get("schemaVersion") != 2:
        errors.append("schemaVersion must be 2")

    lessons = data.get("lessons", [])
    lesson_ids = []
    for li, lesson in enumerate(lessons):
        at = f"lessons[{li}] ({lesson.get('id')})"
        if not SLUG.match(lesson.get("id", "")):
            errors.append(f"{at}: bad id")
        lesson_ids.append(lesson.get("id"))
        for field in ("title", "summary"):
            if not lesson.get(field):
                errors.append(f"{at}: missing {field}")
            elif "*" in lesson[field] or "`" in lesson[field]:
                errors.append(f"{at}: {field} is plain text, no markup or backticks")
        for bi, block in enumerate(lesson.get("blocks", [])):
            bat = f"{at} blocks[{bi}] {block.get('type')}"
            kind = block.get("type")
            if kind not in BLOCK_TYPES:
                errors.append(f"{bat}: block type not allowed in the Python course")
                continue
            if kind in ("heading", "text", "rule", "tip"):
                lint_lesson_text(bat, block["text"])
            elif kind == "list":
                for item in block["items"]:
                    lint_lesson_text(bat, item)
            elif kind == "table":
                if block.get("caption"):
                    lint_lesson_text(bat, block["caption"])
                for cell in block["headers"]:
                    lint_lesson_text(bat, cell)
                for row in block["rows"]:
                    if len(row) != len(block["headers"]):
                        errors.append(f"{bat}: row has {len(row)} cells, expected {len(block['headers'])}")
                    for cell in row:
                        lint_lesson_text(bat, cell)
            elif kind == "code":
                if block.get("caption"):
                    lint_lesson_text(bat, block["caption"])
                if "output" in block:
                    result = run(block["code"])
                    want = block["output"]
                    ok = matches(result, want) if not result.get("exc") else (
                        result["exc"] in want and norm(want).startswith(norm(result["out"]))
                    )
                    if not ok:
                        errors.append(f"{bat}: output says {norm(want)!r} but code gives {describe(result)}")
            elif kind == "bug":
                lint_lesson_text(bat, block["why"])
                if block["wrong"] == block["right"]:
                    errors.append(f"{bat}: wrong and right are identical")

    seen = set()
    per_lesson = Counter()
    styles = Counter()
    positions = Counter()
    for ei, ex in enumerate(data.get("exercises", [])):
        eid = ex.get("id", "")
        at = f"exercises[{ei}] ({eid})"
        if not SLUG.match(eid):
            errors.append(f"{at}: bad id")
        if eid in seen:
            errors.append(f"{at}: duplicate id")
        seen.add(eid)
        choices = ex.get("choices", [])
        answer = ex.get("answerIndex")
        if len(choices) < 2 or len(set(choices)) != len(choices) or not all(choices):
            errors.append(f"{at}: choices must be 2+ distinct non-empty strings")
            continue
        if not isinstance(answer, int) or not 0 <= answer < len(choices):
            errors.append(f"{at}: answerIndex out of range")
            continue
        for field in ("prompt", "explanation"):
            if not ex.get(field):
                errors.append(f"{at}: missing {field}")
            else:
                lint_plain(f"{at} {field}", ex[field])
        if not ex.get("codeChoices"):
            for choice in choices:
                lint_plain(f"{at} choice", choice)
        if "codeChoices" in ex and ex["codeChoices"] is not True:
            errors.append(f"{at}: codeChoices must be true or absent")
        if "code" in ex and not ex["code"].strip():
            errors.append(f"{at}: code must be non-empty when present")
        tags = ex.get("tags", [])
        linked = [t for t in tags if t in lesson_ids]
        if lessons:
            if len(linked) != 1:
                errors.append(f"{at}: must name exactly one lesson id in tags (names {linked})")
            else:
                per_lesson[linked[0]] += 1
        style = [t for t in tags if t in STYLE_TAGS]
        if len(style) != 1:
            errors.append(f"{at}: needs exactly one style tag of {sorted(STYLE_TAGS)}, has {style}")
            continue
        style = style[0]
        styles[style] += 1
        if style != "correct-or-wrong":
            positions[answer] += 1
        code = ex.get("code")

        if style == "output":
            if not code:
                errors.append(f"{at}: output question without code")
                continue
            result = run(code)
            if not matches(result, choices[answer]):
                errors.append(f"{at}: answer {choices[answer]!r} but code gives {describe(result)}")
            others = [c for i, c in enumerate(choices) if i != answer and matches(result, c)]
            if others:
                errors.append(f"{at}: distractor(s) also match the real result: {others}")
        elif style == "correct-or-wrong":
            if choices != ["Correct", "Wrong"]:
                errors.append(f"{at}: choices must be exactly [\"Correct\", \"Wrong\"]")
            if not code:
                errors.append(f"{at}: correct-or-wrong needs code")
                continue
            if eid not in checks:
                errors.append(f"{at}: no check in checks.json")
                continue
            result = run(code, checks[eid])
            if result.get("timeout"):
                verdict, why = "Wrong", "never stops"
            elif result.get("harness_error"):
                errors.append(f"{at}: harness error {result['harness_error']}")
                continue
            else:
                verdict = "Correct" if result["check"] == "pass" else "Wrong"
                why = result["check"] if verdict == "Wrong" else ""
            if verdict != choices[answer]:
                errors.append(f"{at}: marked {choices[answer]} but running it says {verdict} {why}")
        elif style in ("fill-in", "fix"):
            if style == "fill-in" and (not code or "___" not in code):
                errors.append(f"{at}: fill-in needs code containing ___")
                continue
            if eid in checks:
                for i, choice in enumerate(choices):
                    program = code.replace("___", choice) if code and "___" in code else choice
                    result = run(program, checks[eid])
                    passed = not result.get("timeout") and result.get("check") == "pass"
                    if i == answer and not passed:
                        errors.append(f"{at}: the answer {choice!r} fails its check: {describe(result)} {result.get('check')}")
                    if i != answer and passed:
                        errors.append(f"{at}: distractor {choice!r} ALSO passes the check (ambiguous question)")
        if ex.get("codeChoices") is None and any("\n" in c for c in choices):
            warnings.append(f"{at}: multi-line choices without codeChoices: true")

    for lid in lesson_ids:
        if per_lesson[lid] == 0:
            errors.append(f"lesson {lid} has no exercises")
    for eid in checks:
        if eid not in seen:
            warnings.append(f"checks.json has an entry for unknown exercise {eid}")

    print(f"{path.name}: {len(lessons)} lessons, {len(seen)} exercises")
    for lid in lesson_ids:
        print(f"  {lid}: {per_lesson[lid]}")
    print(f"  styles: {dict(styles)}")
    print(f"  answer positions (excluding correct-or-wrong): {dict(sorted(positions.items()))}")
    cw = [e for e in data.get("exercises", []) if "correct-or-wrong" in e.get("tags", [])]
    if cw:
        print(f"  correct-or-wrong verdicts: {dict(Counter(e['choices'][e['answerIndex']] for e in cw))}")
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print("OK" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

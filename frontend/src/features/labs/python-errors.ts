import type { PythonError } from "@/lib/python/protocol";

/**
 * One plain sentence per common error, under the error itself — the same
 * reading the "Reading error messages" lesson teaches.
 */
const ERROR_HINTS: Record<string, string> = {
  SyntaxError:
    "Python could not read this line. Look for a missing colon, bracket or quote.",
  IndentationError:
    "The spaces at the start of a line are off. The lines after a colon are indented by 4 spaces.",
  NameError:
    "A name is used before it exists. Check the spelling, and that it is assigned or defined first.",
  TypeError:
    "An operation got the wrong type of value, like adding a str and an int, or calling with the wrong number of arguments.",
  ValueError: 'The type is right but the value is not, like int("hello").',
  IndexError: "An index is past the end. Valid indexes go from 0 to len - 1.",
  KeyError: "That key is not in the dictionary. Check with in, or use get().",
  ZeroDivisionError: "Something was divided by zero.",
  RecursionError:
    "The function kept calling itself. Is there a base case, and does every call get closer to it?",
  EOFError:
    "The program called input() more times than there are lines of typed input.",
  AttributeError: "That value has no method or attribute with this name.",
  TooMuchOutput: "Look for a loop whose condition never becomes False.",
};

/** "TypeError on line 3: can only concatenate str (not "int") to str" */
export function describeError(error: PythonError): string {
  const where = error.line ? ` on line ${error.line}` : "";
  return `${error.type}${where}: ${error.message}`;
}

export function errorHint(error: PythonError): string | undefined {
  return ERROR_HINTS[error.type];
}

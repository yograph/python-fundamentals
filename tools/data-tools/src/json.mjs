import fs from "node:fs";

/** Reads and parses a JSON file. Throws with the path in the message. */
export function readJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`cannot parse ${filePath}: ${error.message}`);
  }
}

/** Serializes with 2-space indentation and a trailing newline. */
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Writes JSON only when the bytes would change, so reruns are idempotent.
 * @returns {boolean} true when the file was rewritten
 */
export function writeJsonIfChanged(filePath, value) {
  const next = serializeJson(value);
  let current = null;
  try {
    current = fs.readFileSync(filePath, "utf8");
  } catch {
    current = null;
  }
  if (current === next) return false;
  fs.writeFileSync(filePath, next);
  return true;
}

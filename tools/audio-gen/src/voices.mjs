import fs from "node:fs/promises";
import { rel, VOICES_PATH } from "./paths.mjs";

export const DEFAULT_VOICE = "Kore";

/**
 * Optional tools/audio-gen/voices.json, mapping locale to a Gemini prebuilt
 * voice name: { "nl-NL": "Kore", "en-US": "Puck" }. Absent file means every
 * locale uses the default voice.
 */
export async function loadVoices() {
  let raw;
  try {
    raw = await fs.readFile(VOICES_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${rel(VOICES_PATH)} is not valid JSON: ${error.message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${rel(VOICES_PATH)} must be an object of locale -> voice.`,
    );
  }

  for (const [locale, voice] of Object.entries(parsed)) {
    if (typeof voice !== "string" || voice.trim() === "") {
      throw new Error(
        `${rel(VOICES_PATH)}: voice for "${locale}" must be a non-empty string.`,
      );
    }
  }
  return parsed;
}

/**
 * Exact locale first ("nl-NL"), then the bare language ("nl"), then the
 * default, so one entry can cover every region of a language.
 */
export function voiceFor(voices, locale) {
  const language = locale.split("-")[0];
  return voices[locale] ?? voices[language] ?? DEFAULT_VOICE;
}

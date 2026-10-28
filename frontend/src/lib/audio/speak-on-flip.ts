import { useCallback, useState } from "react";

/**
 * "Speak the answer when a card is turned over", remembered between sessions.
 *
 * The preference is a single boolean, so localStorage holds it directly rather
 * than going through the query cache: nothing else reads it, and there is no
 * second writer to keep in sync. As in `lib/progress/store.ts`, every touch is
 * wrapped - reading `window.localStorage` itself throws in private-mode Safari,
 * and a lost preference must never take the session down with it.
 */

const STORAGE_KEY = "python-fundamentals:speak-on-flip:v1";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage disabled. The default (off) is the honest answer.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded, or storage disabled. The choice still holds for this
    // session; there is nothing useful to tell the learner.
  }
}

/** Off unless the learner has turned it on: audio should never start unasked. */
export function readSpeakOnFlip(): boolean {
  return safeGet(STORAGE_KEY) === "true";
}

export function writeSpeakOnFlip(enabled: boolean): void {
  safeSet(STORAGE_KEY, enabled ? "true" : "false");
}

interface UseSpeakOnFlipResult {
  speakOnFlip: boolean;
  setSpeakOnFlip: (enabled: boolean) => void;
}

/**
 * The preference as component state, seeded from storage once on mount (a lazy
 * initialiser, so this is not a read on every render) and written through on
 * every change.
 */
export function useSpeakOnFlip(): UseSpeakOnFlipResult {
  const [speakOnFlip, setState] = useState(readSpeakOnFlip);

  const setSpeakOnFlip = useCallback((enabled: boolean) => {
    setState(enabled);
    writeSpeakOnFlip(enabled);
  }, []);

  return { speakOnFlip, setSpeakOnFlip };
}

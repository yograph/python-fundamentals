/**
 * The three localStorage touches every progress store goes through.
 * `localStorage` is accessed lazily rather than captured at module load,
 * because in some browsers merely reading `window.localStorage` throws — and
 * the hard rule of the progress stores is that **reads never throw**.
 */

export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded, or storage disabled. Progress for this session lives on
    // in the query cache; there is nothing useful to tell the learner.
  }
}

export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See safeSet.
  }
}

// Word id rules, per docs/DATA_CONTRACT.md.
//
// A word id is the slug of its `front`:
//   - lowercased
//   - every run of characters outside [a-z0-9] collapsed to a single "-"
//   - leading/trailing "-" trimmed
//   - empty result falls back to "word"
// Colliding slugs get "-2", "-3", ... appended in document order.
//
// Ids are the key user progress is stored under, so they must never be
// renumbered or reassigned once published.

const FALLBACK_SLUG = "word";

/** @param {string} text @returns {string} */
export function slugify(text) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? FALLBACK_SLUG : slug;
}

/**
 * Assigns ids to words in document order, appending -2, -3, ... on collision.
 * Returns new word objects with `id` first; input is not mutated.
 * @param {Array<{front: string}>} words
 */
export function assignWordIds(words) {
  const seen = new Map(); // base slug -> how many times used
  return words.map((word) => {
    const base = slugify(word.front);
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    const id = used === 0 ? base : `${base}-${used + 1}`;
    return { id, ...word };
  });
}

/**
 * True when `id` is a legal id for `front`: either the bare slug or the slug
 * with a `-N` collision suffix (N >= 2). Deliberately permissive about which N
 * so that existing, published ids stay valid even if word order changes.
 * @param {string} id @param {string} front
 */
export function isValidWordId(id, front) {
  const base = slugify(front);
  if (id === base) return true;
  const suffix = id.startsWith(`${base}-`) ? id.slice(base.length + 1) : null;
  return suffix !== null && /^[2-9]\d*$/.test(suffix);
}

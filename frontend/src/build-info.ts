/**
 * Who am I, exactly? Answered by the commit the bundle was built from, injected
 * by vite.config.ts at build time.
 *
 * This exists instead of bumping package.json per commit. Nobody installs this
 * app by version number, so a hand-maintained semver would be decoration that
 * can silently disagree with what is deployed; a commit hash cannot.
 */

declare const __APP_COMMIT__: string;
declare const __BUILT_AT__: string;
declare const __APP_REPO__: string;

export const APP_COMMIT: string = __APP_COMMIT__;
export const BUILT_AT: string = __BUILT_AT__;
export const APP_REPO: string = __APP_REPO__;

/** e.g. "42be5d7 · 17 Aug 2026". Falls back gracefully if the date is unusable. */
export function buildLabel(): string {
  const built = new Date(BUILT_AT);
  if (Number.isNaN(built.getTime())) return APP_COMMIT;
  const date = built.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${APP_COMMIT} · ${date}`;
}

/** Link straight to the deployed commit on GitHub. */
export function commitUrl(): string | null {
  if (APP_COMMIT === "unknown" || APP_REPO === "unknown") return null;
  return `https://github.com/${APP_REPO}/commit/${APP_COMMIT}`;
}

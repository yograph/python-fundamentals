/**
 * Post-build steps that make the Vite output deployable on GitHub Pages:
 *
 *  1. Copy the repo's `data/` folder into `dist/data`, so the deployed site
 *     serves decks and audio same-origin (no CORS, no rate limits, cacheable).
 *  2. Duplicate index.html as 404.html. GitHub Pages serves 404.html for any
 *     unknown path, which is how a client-routed SPA survives deep links and
 *     hard refreshes.
 *  3. Write .nojekyll so Pages never runs Jekyll over the asset folders.
 */
import { access, copyFile, cp, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const data = fileURLToPath(new URL("../../data", import.meta.url));

const exists = async (p) =>
  access(p).then(
    () => true,
    () => false,
  );

if (!(await exists(dist))) {
  throw new Error(`Build output missing: ${dist}. Run "vite build" first.`);
}

if (await exists(data)) {
  await cp(data, `${dist}/data`, { recursive: true });
  console.log("postbuild: copied data/ -> dist/data");
} else {
  console.warn(`postbuild: no data/ folder at ${data}, skipping data copy`);
}

await copyFile(`${dist}/index.html`, `${dist}/404.html`);
console.log("postbuild: wrote dist/404.html (SPA fallback)");

await writeFile(`${dist}/.nojekyll`, "");
console.log("postbuild: wrote dist/.nojekyll");

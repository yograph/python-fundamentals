/// <reference types="vite/client" />

/**
 * Environment variables this app reads. Anything not listed here is a typo.
 *
 * `VITE_DATA_BASE_URL` overrides where `data/` is served from. It is optional:
 * the default (`/data`) is same-origin, which is what both `vite dev` and the
 * Pages deployment serve. Set it only when pointing the app at data hosted
 * somewhere else.
 */
interface ImportMetaEnv {
  readonly VITE_DATA_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

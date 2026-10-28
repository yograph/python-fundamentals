import { QueryClient } from "@tanstack/react-query";

/** A week - matches the persister's `maxAge` in `provider.tsx`. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The app's single QueryClient.
 *
 * Defaults are tuned for static, versioned data: `gcTime` outlives a session so
 * a restored cache is not swept before the UI mounts, and `networkMode` is
 * "offlineFirst" so a fetch is still attempted when the browser claims to be
 * offline (it is often wrong) instead of the query pausing forever.
 *
 * Exported as a factory rather than a module-level instance so tests and
 * `AppQueryProvider` each get an isolated cache.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: WEEK_MS,
        retry: 2,
        refetchOnWindowFocus: false,
        networkMode: "offlineFirst",
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

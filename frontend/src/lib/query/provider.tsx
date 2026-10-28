import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useState } from "react";
import { DATA_SCHEMA_VERSION } from "@/lib/data/schemas";
import { createQueryClient } from "./client";

/**
 * Query cache persistence. This is what lets the app open offline showing the
 * decks it already had: the manifest refetch fails, the restored cache renders.
 */

const PERSIST_KEY = "python-fundamentals:query:v1";
/** A week of offline grace. Older caches are dropped rather than restored. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Bumping the data schema version invalidates every persisted cache, so a
 * client that restores an old cache after a breaking data change throws it away
 * instead of rendering shapes it no longer understands.
 */
const BUSTER = `data-v${DATA_SCHEMA_VERSION}`;

const persister = createSyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.localStorage,
  key: PERSIST_KEY,
  throttleTime: 1000,
});

export function AppQueryProvider({
  children,
  client,
}: {
  children: ReactNode;
  /** Pass a client when it must be shared (e.g. with the router context). */
  client?: QueryClient;
}) {
  const [fallbackClient] = useState(createQueryClient);
  const queryClient = client ?? fallbackClient;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: MAX_AGE_MS,
        buster: BUSTER,
        dehydrateOptions: {
          /**
           * Only remote `data` queries are persisted.
           *
           * `progress` queries are deliberately excluded: localStorage already
           * owns learner progress under its own key, and persisting the query
           * cache too would make two writers for one fact. They would drift the
           * moment a write succeeded against one and failed against the other
           * (or the cache was restored from a stale snapshot), and the loser
           * would silently overwrite real progress. One owner, one key.
           */
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && query.queryKey[0] === "data",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

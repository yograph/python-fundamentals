import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { z } from "zod";

import { STUDY_DIRECTIONS } from "@/features/study/directions";
import { CoursePage } from "@/routes/course-route";
import { DeckPage } from "@/routes/deck-route";
import { OverviewPage } from "@/routes/index-route";
import { LessonPage } from "@/routes/lesson-route";
import { PracticePage } from "@/routes/practice-route";
import { NotFoundPage, RootLayout, RouteErrorPage } from "@/routes/root-layout";
import { StudyPage } from "@/routes/study-route";

/**
 * Route shape:
 *
 *   /                    the deck grid and the practice sets
 *   /deck/$deckId        the deck's own page: word list, direction, start
 *   /deck/$deckId/study  the session
 *   /practice/$setId     a practice set: grammar, translation or writing
 *   /grammar/$setId      a grammar course level: its lessons, in order
 *   /grammar/$setId/$lessonId   one lesson
 *
 * The deck used to open in a drawer over the grid, which capped how much could
 * be shown and nested a scroll area inside the page's own. A real page has the
 * whole viewport, and "back" means what a learner expects.
 *
 * The deck id is a path param rather than a search param because it identifies
 * the resource; direction and tags stay in the search string because they are
 * options on it, and they carry through to /study so a session survives a
 * refresh and can be linked.
 */

/**
 * Tags normally travel as a JSON array (`?tags=["a","b"]`), but a hand-typed
 * `?tags=a,b` is accepted too. Anything else falls back to "all tags", which is
 * also the default: tags are a filter, not a required choice.
 */
const tagsSchema = z
  .union([z.array(z.string()), z.string().transform((raw) => raw.split(","))])
  .transform((tags) => tags.map((tag) => tag.trim()).filter(Boolean))
  .transform((tags) => (tags.length > 0 ? tags : undefined))
  .optional()
  .catch(undefined);

/**
 * Every field has its own `.catch(...)`, so a truncated or hand-edited URL
 * degrades to a typed default instead of throwing during render.
 */
const deckSearchSchema = z.object({
  tags: tagsSchema,
  /**
   * Optional, like `tags`: absent means the default direction, so a link that
   * has no opinion can omit it and the URL stays clean until the learner
   * actually flips the switch. Resolve it with `resolveDirection`.
   */
  direction: z.enum(STUDY_DIRECTIONS).optional().catch(undefined),
});

export type DeckSearch = z.output<typeof deckSearchSchema>;

const validateDeckSearch = (search: Record<string, unknown>): DeckSearch =>
  deckSearchSchema.parse(search);

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});

const deckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId",
  validateSearch: validateDeckSearch,
  component: DeckPage,
});

const studyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/study",
  validateSearch: validateDeckSearch,
  component: StudyPage,
});

/**
 * A practice set has no direction or tag options. Its one option is `lesson`:
 * a grammar course's lesson id, narrowing the round to that lesson's
 * exercises. Absent, or naming no lesson of the set, means the whole set.
 */
const practiceSearchSchema = z.object({
  lesson: z.string().min(1).optional().catch(undefined),
});

export type PracticeSearch = z.output<typeof practiceSearchSchema>;

const practiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/practice/$setId",
  validateSearch: (search: Record<string, unknown>): PracticeSearch =>
    practiceSearchSchema.parse(search),
  component: PracticePage,
});

// The lesson id is a path param, like the deck id: it names the resource.
const courseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/grammar/$setId",
  component: CoursePage,
});

const lessonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/grammar/$setId/$lessonId",
  component: LessonPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  deckRoute,
  studyRoute,
  practiceRoute,
  courseRoute,
  lessonRoute,
]);

export const router = createRouter({
  routeTree,
  // Vite's BASE_URL is "/" locally and on the custom domain, and "/<repo>/"
  // when deployed as a GitHub project page — the router must agree with the
  // asset base or every route 404s under the subpath.
  basepath: import.meta.env.BASE_URL,
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: RouteErrorPage,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

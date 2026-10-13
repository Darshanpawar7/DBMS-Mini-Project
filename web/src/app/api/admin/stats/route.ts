import { requireApiAdmin } from "@/lib/auth/current-user";
import { ok, route } from "@/lib/http";
import {
  contentGaps,
  courseEngagement,
  documentsByVisibility,
  embeddingStatusCounts,
  platformTotals,
  searchesPerDay,
  topContributors,
  topQueries,
} from "@/lib/repos/stats";

// GET /api/admin/stats -- everything the admin dashboard shows, in one call
export const GET = route(async () => {
  await requireApiAdmin();
  const [totals, visibility, embeddings, searches, queries, gaps, courses, contributors] = await Promise.all([
    platformTotals(),
    documentsByVisibility(),
    embeddingStatusCounts(),
    searchesPerDay(),
    topQueries(),
    contentGaps(),
    courseEngagement(),
    topContributors(),
  ]);
  return ok({ totals, visibility, embeddings, searches, queries, gaps, courses, contributors });
});

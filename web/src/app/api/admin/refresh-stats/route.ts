import { requireApiAdmin } from "@/lib/auth/current-user";
import { ok, route } from "@/lib/http";
import { refreshCourseEngagement } from "@/lib/repos/stats";

// POST -- REFRESH MATERIALIZED VIEW CONCURRENTLY via the SECURITY DEFINER function
export const POST = route(async () => {
  await requireApiAdmin();
  return ok({ refreshed_at: await refreshCourseEngagement() });
});

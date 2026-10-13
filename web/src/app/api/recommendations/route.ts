import { requireApiUser } from "@/lib/auth/current-user";
import { ok, route } from "@/lib/http";
import { recommendGroups, recommendPartners } from "@/lib/repos/groups";

// GET /api/recommendations -- study groups and partners ranked by interest-vector similarity
export const GET = route(async () => {
  const user = await requireApiUser();
  const [groups, partners] = await Promise.all([recommendGroups(user.student_id, 6), recommendPartners(user.student_id, 6)]);
  return ok({ groups, partners });
});

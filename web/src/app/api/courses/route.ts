import { requireApiUser } from "@/lib/auth/current-user";
import { ok, route } from "@/lib/http";
import { listCoursesWithStats } from "@/lib/repos/courses";

// GET /api/courses -- every course with live counts and the caller's enrolled semesters
export const GET = route(async () => {
  const user = await requireApiUser();
  return ok(await listCoursesWithStats(user.student_id));
});

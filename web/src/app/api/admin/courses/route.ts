import { requireApiAdmin } from "@/lib/auth/current-user";
import { ok, readJson, route } from "@/lib/http";
import { createCourse } from "@/lib/repos/courses";
import { courseSchema } from "@/lib/validation";

export const POST = route(async (request) => {
  const admin = await requireApiAdmin();
  const input = courseSchema.parse(await readJson(request));
  return ok(await createCourse(admin.student_id, input), 201);
});

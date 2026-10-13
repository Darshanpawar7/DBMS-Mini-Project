import { requireApiAdmin } from "@/lib/auth/current-user";
import { ApiError, ok, parseId, readJson, route } from "@/lib/http";
import { deleteCourse, updateCourse } from "@/lib/repos/courses";
import { courseSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/admin/courses/[id]">;

export const PATCH = route(async (request, ctx: Ctx) => {
  const admin = await requireApiAdmin();
  const id = parseId((await ctx.params).id);
  const input = courseSchema.parse(await readJson(request));
  if (!(await updateCourse(admin.student_id, id, input))) throw new ApiError(404, "Course not found");
  return ok({ course_id: id, ...input });
});

// DELETE -- enrollments and groups cascade; documents survive as private notes
export const DELETE = route(async (_request, ctx: Ctx) => {
  const admin = await requireApiAdmin();
  const id = parseId((await ctx.params).id);
  if (!(await deleteCourse(admin.student_id, id))) throw new ApiError(404, "Course not found");
  return ok({ deleted: id });
});

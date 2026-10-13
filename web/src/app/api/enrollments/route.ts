import { requireApiUser } from "@/lib/auth/current-user";
import { ApiError, ok, readJson, route } from "@/lib/http";
import { enroll, unenroll } from "@/lib/repos/courses";
import { enrollmentSchema } from "@/lib/validation";

// POST /api/enrollments { course_id, semester }
export const POST = route(async (request) => {
  const user = await requireApiUser();
  const input = enrollmentSchema.parse(await readJson(request));
  await enroll(user.student_id, input.course_id, input.semester);
  return ok(input, 201);
});

// DELETE /api/enrollments { course_id, semester } -- also leaves that course's study groups
export const DELETE = route(async (request) => {
  const user = await requireApiUser();
  const input = enrollmentSchema.parse(await readJson(request));
  const removed = await unenroll(user.student_id, input.course_id, input.semester);
  if (!removed) throw new ApiError(404, "You are not enrolled in that course for that semester");
  return ok(input);
});

import { requireApiUser } from "@/lib/auth/current-user";
import { ok, readJson, route } from "@/lib/http";
import { createGroup, listGroupsForStudent } from "@/lib/repos/groups";
import { groupCreateSchema } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireApiUser();
  return ok(await listGroupsForStudent(user.student_id, user.role === "admin"));
});

// POST /api/groups { group_name, description?, course_id, max_members }
// The database makes the creator the group admin and rejects non-enrolled creators.
export const POST = route(async (request) => {
  const user = await requireApiUser();
  const input = groupCreateSchema.parse(await readJson(request));
  const groupId = await createGroup(user.student_id, input);
  return ok({ group_id: groupId }, 201);
});

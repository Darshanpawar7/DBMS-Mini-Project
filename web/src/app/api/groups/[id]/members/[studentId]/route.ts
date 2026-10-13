import { requireApiUser } from "@/lib/auth/current-user";
import { ApiError, ok, parseId, readJson, route } from "@/lib/http";
import { assertGroupManager, removeMember, setMemberRole } from "@/lib/repos/groups";
import { memberRoleSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/groups/[id]/members/[studentId]">;

async function target(ctx: Ctx): Promise<{ groupId: number; studentId: number }> {
  const params = await ctx.params;
  return { groupId: parseId(params.id), studentId: parseId(params.studentId, "student id") };
}

// PATCH { role: 'admin' | 'member' } -- promote/demote; the DB refuses to remove the last admin
export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { groupId, studentId } = await target(ctx);
  const { role } = memberRoleSchema.parse(await readJson(request));
  await assertGroupManager(groupId, user.student_id, user.role === "admin");
  await setMemberRole(user.student_id, groupId, studentId, role);
  return ok({ group_id: groupId, student_id: studentId, role });
});

// DELETE -- remove someone else from the group (use /membership to leave yourself)
export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { groupId, studentId } = await target(ctx);
  if (studentId === user.student_id) throw new ApiError(400, "Use 'Leave group' to remove yourself");
  await assertGroupManager(groupId, user.student_id, user.role === "admin");
  await removeMember(user.student_id, groupId, studentId);
  return ok({ group_id: groupId, removed: studentId });
});

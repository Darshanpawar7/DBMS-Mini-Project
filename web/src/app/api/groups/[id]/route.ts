import { requireApiUser } from "@/lib/auth/current-user";
import { ApiError, ok, parseId, readJson, route } from "@/lib/http";
import { assertGroupManager, deleteGroup, getGroup, listMembers, updateGroup } from "@/lib/repos/groups";
import { groupUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/groups/[id]">;

export const GET = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const groupId = parseId((await ctx.params).id);
  const group = await getGroup(groupId, user.student_id);
  if (!group) throw new ApiError(404, "Group not found");
  return ok({ group, members: await listMembers(groupId) });
});

// PATCH /api/groups/:id { group_name, description, max_members } -- group admins only
export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser();
  const groupId = parseId((await ctx.params).id);
  const input = groupUpdateSchema.parse(await readJson(request));
  await assertGroupManager(groupId, user.student_id, user.role === "admin");
  await updateGroup(user.student_id, groupId, input);
  return ok({ group_id: groupId });
});

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const groupId = parseId((await ctx.params).id);
  await assertGroupManager(groupId, user.student_id, user.role === "admin");
  await deleteGroup(user.student_id, groupId);
  return ok({ deleted: groupId });
});

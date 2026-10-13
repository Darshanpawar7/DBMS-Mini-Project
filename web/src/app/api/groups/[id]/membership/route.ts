import { requireApiUser } from "@/lib/auth/current-user";
import { ok, parseId, route } from "@/lib/http";
import { joinGroup, leaveGroup } from "@/lib/repos/groups";

type Ctx = RouteContext<"/api/groups/[id]/membership">;

// POST /api/groups/:id/membership -- join (CALL sp_join_group; seat + enrollment rules in the DB)
export const POST = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const groupId = parseId((await ctx.params).id);
  await joinGroup(user.student_id, groupId);
  return ok({ group_id: groupId, joined: true }, 201);
});

// DELETE /api/groups/:id/membership -- leave (admin hand-over / empty-group clean-up by trigger)
export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const groupId = parseId((await ctx.params).id);
  const result = await leaveGroup(user.student_id, groupId);
  return ok({ group_id: groupId, ...result });
});

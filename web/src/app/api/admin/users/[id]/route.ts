import { requireApiAdmin } from "@/lib/auth/current-user";
import { ApiError, ok, parseId, readJson, route } from "@/lib/http";
import { deleteStudentByAdmin, updateStudentByAdmin } from "@/lib/repos/students";
import { adminUserUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/admin/users/[id]">;

async function targetId(ctx: Ctx, adminId: number): Promise<number> {
  const id = parseId((await ctx.params).id);
  // an admin cannot lock themselves out
  if (id === adminId) throw new ApiError(400, "You cannot change or delete your own admin account");
  return id;
}

// PATCH { role?: 'student'|'admin', is_active?: boolean } -- audited by trigger
export const PATCH = route(async (request, ctx: Ctx) => {
  const admin = await requireApiAdmin();
  const id = await targetId(ctx, admin.student_id);
  const changes = adminUserUpdateSchema.parse(await readJson(request));
  await updateStudentByAdmin(admin.student_id, id, changes);
  return ok({ student_id: id, ...changes });
});

// DELETE -- removes the account; their documents cascade, their groups survive (created_by SET NULL)
export const DELETE = route(async (_request, ctx: Ctx) => {
  const admin = await requireApiAdmin();
  const id = await targetId(ctx, admin.student_id);
  if (!(await deleteStudentByAdmin(admin.student_id, id))) throw new ApiError(404, "Student not found");
  return ok({ deleted: id });
});

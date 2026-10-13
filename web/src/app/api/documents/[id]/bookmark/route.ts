import { requireApiUser } from "@/lib/auth/current-user";
import { ok, parseId, route } from "@/lib/http";
import { setBookmark } from "@/lib/repos/documents";

type Ctx = RouteContext<"/api/documents/[id]/bookmark">;

export const POST = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const docId = parseId((await ctx.params).id);
  await setBookmark(user.student_id, docId, true);
  return ok({ doc_id: docId, bookmarked: true });
});

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const docId = parseId((await ctx.params).id);
  await setBookmark(user.student_id, docId, false);
  return ok({ doc_id: docId, bookmarked: false });
});

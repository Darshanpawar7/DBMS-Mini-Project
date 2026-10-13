import { requireApiUser } from "@/lib/auth/current-user";
import { assertCanUseCourse } from "@/lib/repos/courses";
import { deleteUpload } from "@/lib/files";
import { ApiError, ok, parseId, readJson, route } from "@/lib/http";
import { deleteDocument, getDocumentForViewer, updateDocument } from "@/lib/repos/documents";
import { documentUpdateSchema, splitTags } from "@/lib/validation";

type Ctx = RouteContext<"/api/documents/[id]">;

export const GET = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const docId = parseId((await ctx.params).id);
  const doc = await getDocumentForViewer(user.student_id, docId);
  if (!doc) throw new ApiError(404, "Document not found");
  return ok(doc);
});

export const PATCH = route(async (request, ctx: Ctx) => {
  const user = await requireApiUser();
  const docId = parseId((await ctx.params).id);
  const body = await readJson(request);
  const meta = documentUpdateSchema.parse({
    ...body,
    tags: Array.isArray(body.tags) ? body.tags : splitTags(body.tags),
  });
  await assertCanUseCourse(user, meta.course_id);
  await updateDocument(user.student_id, user.role === "admin", docId, meta);
  return ok({ doc_id: docId });
});

export const DELETE = route(async (_request, ctx: Ctx) => {
  const user = await requireApiUser();
  const docId = parseId((await ctx.params).id);
  const storedName = await deleteDocument(user.student_id, user.role === "admin", docId);
  await deleteUpload(storedName);
  return ok({ deleted: docId });
});

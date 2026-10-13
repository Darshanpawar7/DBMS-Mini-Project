import { requireApiAdmin } from "@/lib/auth/current-user";
import { ok, readJson, route } from "@/lib/http";
import { mergeTags } from "@/lib/repos/documents";
import { tagMergeSchema } from "@/lib/validation";

// POST { from, into } -- CALL sp_merge_tags (one transaction)
export const POST = route(async (request) => {
  const admin = await requireApiAdmin();
  const { from, into } = tagMergeSchema.parse(await readJson(request));
  await mergeTags(admin.student_id, from, into);
  return ok({ merged: from, into });
});

import { requireApiUser } from "@/lib/auth/current-user";
import { ok, route } from "@/lib/http";
import { runSearch } from "@/lib/repos/search";
import { searchSchema } from "@/lib/validation";

// GET /api/search?q=...&mode=hybrid|semantic|keyword&course=ID&tag=name
export const GET = route(async (request) => {
  const user = await requireApiUser();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const input = searchSchema.parse(params);
  return ok(await runSearch(user.student_id, input));
});

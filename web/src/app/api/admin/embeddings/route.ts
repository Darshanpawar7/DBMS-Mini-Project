import { requireApiAdmin } from "@/lib/auth/current-user";
import { ok, route } from "@/lib/http";
import { processPendingEmbeddings } from "@/lib/repos/embedding-jobs";

// POST -- embed every pending/failed document and any un-embedded search queries
export const POST = route(async () => {
  await requireApiAdmin();
  return ok(await processPendingEmbeddings());
});

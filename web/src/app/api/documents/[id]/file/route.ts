import { requireApiUser } from "@/lib/auth/current-user";
import { readUpload } from "@/lib/files";
import { ApiError, parseId, route } from "@/lib/http";
import { getDocumentForViewer } from "@/lib/repos/documents";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

// GET /api/documents/:id/file -- download, after the same visibility check as everything else
export const GET = route(async (_request, ctx: RouteContext<"/api/documents/[id]/file">) => {
  const user = await requireApiUser();
  const doc = await getDocumentForViewer(user.student_id, parseId((await ctx.params).id));
  if (!doc) throw new ApiError(404, "Document not found");

  // Seed documents have no file on disk; their extracted text is served instead.
  const stored = await readUpload(doc.file_path);
  const body = stored ?? Buffer.from(doc.content ?? "", "utf-8");
  const type = stored ? doc.file_type : "md";
  const safeName = doc.title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "document";

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": MIME[type] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}.${type}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

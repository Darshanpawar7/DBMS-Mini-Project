import Link from "next/link";
import type { ReactNode } from "react";
import { timeAgo } from "@/lib/format";
import type { DocumentCard as DocumentCardData } from "@/lib/types";
import { Badge, TagList, VisibilityBadge } from "./ui";

const FILE_LABEL: Record<string, string> = { pdf: "PDF", txt: "TXT", md: "MD" };

export function DocumentCard({ doc, children }: { doc: DocumentCardData; children?: ReactNode }) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-lg hover:shadow-brand-900/5">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        {doc.course_code && <span className="font-medium text-brand-700">{doc.course_code}</span>}
        <span aria-hidden>·</span>
        <span>{timeAgo(doc.upload_date)}</span>
        <span className="ml-auto rounded border border-slate-200 px-1.5 py-px font-mono text-[10px] text-slate-500">{FILE_LABEL[doc.file_type] ?? doc.file_type}</span>
      </div>
      <h3 className="font-display text-lg font-semibold leading-snug text-ink">
        <Link href={`/documents/${doc.doc_id}`} className="hover:text-brand-700 focus-visible:underline focus-visible:outline-none">
          {doc.title}
        </Link>
      </h3>
      {doc.description && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{doc.description}</p>}
      {children}
      <div className="mt-auto space-y-3 pt-4">
        <TagList tags={doc.tags} limit={3} />
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">by {doc.owner_name}</span>
          <span className="flex items-center gap-2">
            {doc.embedding_status !== "ready" && <Badge tone="amber">{doc.embedding_status === "failed" ? "Not embedded" : "Embedding…"}</Badge>}
            <VisibilityBadge visibility={doc.visibility} />
            <span title="Bookmarks" className="tabular-nums">
              ★ {doc.bookmark_count}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

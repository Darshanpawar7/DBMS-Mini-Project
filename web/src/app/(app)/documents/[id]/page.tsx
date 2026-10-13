import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, Meter, SectionTitle, TagList, VisibilityBadge, buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { formatBytes, formatDate } from "@/lib/format";
import { listAllCourses, listMyCourses } from "@/lib/repos/courses";
import { getDocumentForViewer, similarDocuments } from "@/lib/repos/documents";
import { DocumentForm } from "../document-form";

export const metadata: Metadata = { title: "Note" };

export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[id]">) {
  const user = await requireUser();
  const docId = Number((await params).id);
  if (!Number.isInteger(docId) || docId <= 0) notFound();

  const doc = await getDocumentForViewer(user.student_id, docId);
  if (!doc) notFound(); // missing OR not visible to this user -- same response

  const isEditing = (await searchParams).edit === "1";
  const canEdit = doc.owner_id === user.student_id || user.role === "admin";
  const [similar, courses] = await Promise.all([
    similarDocuments(user.student_id, docId),
    canEdit && isEditing ? (user.role === "admin" ? listAllCourses() : listMyCourses(user.student_id)) : Promise.resolve([]),
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <article>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/documents" className="hover:text-ink">
            Library
          </Link>
          <span aria-hidden>/</span>
          {doc.course_code ? <span className="font-medium text-brand-700">{doc.course_code}</span> : <span>No course</span>}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{doc.title}</h1>
        {doc.description && <p className="mt-3 text-lg text-slate-600">{doc.description}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <VisibilityBadge visibility={doc.visibility} />
          {doc.embedding_status !== "ready" && <Badge tone="amber">Embedding {doc.embedding_status}</Badge>}
          <TagList tags={doc.tags} limit={8} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {doc.is_bookmarked ? (
            <ActionButton url={`/api/documents/${doc.doc_id}/bookmark`} method="DELETE">
              ★ Saved
            </ActionButton>
          ) : (
            <ActionButton url={`/api/documents/${doc.doc_id}/bookmark`} variant="primary">
              ☆ Save
            </ActionButton>
          )}
          <a href={`/api/documents/${doc.doc_id}/file`} className={buttonClass("secondary", "sm")}>
            Download
          </a>
          {canEdit && !isEditing && (
            <Link href={`/documents/${doc.doc_id}?edit=1`} className={buttonClass("secondary", "sm")}>
              Edit details
            </Link>
          )}
          {canEdit && (
            <ActionButton url={`/api/documents/${doc.doc_id}`} method="DELETE" variant="danger" confirmText="Delete this note for everyone? This cannot be undone." redirectTo="/documents?scope=mine">
              Delete
            </ActionButton>
          )}
        </div>

        {isEditing && canEdit ? (
          <Card className="mt-8 p-6">
            <SectionTitle>Edit details</SectionTitle>
            <DocumentForm courses={courses} initial={{ doc_id: doc.doc_id, title: doc.title, description: doc.description, visibility: doc.visibility, course_id: doc.course_id, tags: doc.tags }} />
          </Card>
        ) : (
          <Card className="mt-8 p-6 sm:p-8">
            <div className="prose-note text-[15px] text-slate-800">{doc.content}</div>
          </Card>
        )}
      </article>

      <aside className="space-y-6">
        <Card>
          <SectionTitle>Details</SectionTitle>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Owner", doc.owner_name],
              ["Course", doc.course_title ?? "—"],
              ["Uploaded", formatDate(doc.upload_date)],
              ["Last edited", formatDate(doc.updated_at)],
              ["File", `${doc.file_type.toUpperCase()} · ${formatBytes(doc.file_size_bytes)}`],
              ["Passages embedded", String(doc.chunk_count)],
              ["Saved by", `${doc.bookmark_count} student${doc.bookmark_count === 1 ? "" : "s"}`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <SectionTitle>More like this</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-muted">Nearest notes by the cosine distance between document centroids.</p>
          {similar.length === 0 ? (
            <p className="text-sm text-muted">Nothing similar yet.</p>
          ) : (
            <ul className="space-y-3">
              {similar.map((s) => (
                <li key={s.doc_id}>
                  <Link href={`/documents/${s.doc_id}`} className="text-sm font-medium text-ink hover:text-brand-700">
                    {s.title}
                  </Link>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{s.course_code ?? "—"}</span>
                    <Meter value={s.similarity} label="Similarity" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}

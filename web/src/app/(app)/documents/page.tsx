import type { Metadata } from "next";
import Link from "next/link";
import { DocumentCard } from "@/components/document-card";
import { EmptyState, LinkButton, PageHeader, buttonClass, cx, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listAllCourses } from "@/lib/repos/courses";
import { PAGE_SIZE, listDocuments, listTags } from "@/lib/repos/documents";
import { documentListSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Library" };

const SCOPES = [
  { value: "all", label: "All notes" },
  { value: "mine", label: "My uploads" },
  { value: "bookmarked", label: "Saved" },
] as const;

export default async function LibraryPage({ searchParams }: PageProps<"/documents">) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = documentListSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : documentListSchema.parse({});
  const [{ items, total }, courses, tags] = await Promise.all([listDocuments(user.student_id, filters), listAllCourses(), listTags(1)]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // build links that keep the other filters (URL is the source of truth)
  const linkWith = (changes: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q: filters.q, course: filters.course ?? undefined, tag: filters.tag, scope: filters.scope, sort: filters.sort, page: filters.page, ...changes };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "" && !(key === "scope" && value === "all") && !(key === "sort" && value === "recent") && !(key === "page" && value === 1)) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return qs ? `/documents?${qs}` : "/documents";
  };

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Notes you can open"
        description="Every listing goes through the same access rule as search: public notes, notes from your courses, and your own private notes."
        actions={<LinkButton href="/documents/new">Upload a note</LinkButton>}
      />

      <nav aria-label="Scope" className="mb-4 flex gap-1 border-b border-line">
        {SCOPES.map((s) => (
          <Link
            key={s.value}
            href={linkWith({ scope: s.value, page: 1 })}
            aria-current={filters.scope === s.value ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-4 py-2 text-sm font-medium", filters.scope === s.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-ink")}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <form className="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]" action="/documents">
        <input type="hidden" name="scope" value={filters.scope} />
        <label className="sr-only" htmlFor="lib-q">
          Filter by title
        </label>
        <input id="lib-q" name="q" defaultValue={filters.q} placeholder="Filter by title or description" className={inputClass} />
        <select name="course" aria-label="Course" defaultValue={filters.course ?? ""} className={inputClass}>
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.course_id} value={c.course_id}>
              {c.course_code}
            </option>
          ))}
        </select>
        <select name="tag" aria-label="Tag" defaultValue={filters.tag ?? ""} className={inputClass}>
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.tag_name} value={t.tag_name}>
              #{t.tag_name} ({t.documents})
            </option>
          ))}
        </select>
        <select name="sort" aria-label="Sort" defaultValue={filters.sort} className={inputClass}>
          <option value="recent">Newest first</option>
          <option value="popular">Most saved</option>
          <option value="title">Title A–Z</option>
        </select>
        <button className={buttonClass("secondary")}>Apply</button>
      </form>

      <p className="mb-4 text-sm text-muted">
        {total} note{total === 1 ? "" : "s"}
        {filters.tag && (
          <>
            {" "}
            tagged <strong className="text-ink">#{filters.tag}</strong> ·{" "}
            <Link href={linkWith({ tag: undefined, page: 1 })} className="text-brand-600 hover:underline">
              clear
            </Link>
          </>
        )}
      </p>

      {items.length === 0 ? (
        <EmptyState
          title={filters.scope === "mine" ? "You haven't uploaded anything yet" : "No notes match these filters"}
          action={filters.scope === "mine" ? <LinkButton href="/documents/new">Upload your first note</LinkButton> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((doc) => (
            <DocumentCard key={doc.doc_id} doc={doc} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
          {filters.page > 1 && (
            <Link href={linkWith({ page: filters.page - 1 })} className={buttonClass("secondary", "sm")}>
              ← Previous
            </Link>
          )}
          <span className="px-3 text-sm text-muted">
            Page {filters.page} of {pages}
          </span>
          {filters.page < pages && (
            <Link href={linkWith({ page: filters.page + 1 })} className={buttonClass("secondary", "sm")}>
              Next →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { HorizontalBars, StackedColumns } from "@/components/charts";
import { SERIES_COLORS } from "@/lib/chart-palette";
import { Badge, Card, PageHeader, SectionTitle, StatTile } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth/current-user";
import { formatDate, timeAgo } from "@/lib/format";
import {
  contentGaps,
  courseEngagement,
  documentsByVisibility,
  embeddingStatusCounts,
  platformTotals,
  searchesPerDay,
  topContributors,
  topQueries,
} from "@/lib/repos/stats";

export const metadata: Metadata = { title: "Admin overview" };

const SERIES = [
  { key: "hybrid", label: "Hybrid", color: SERIES_COLORS[0] },
  { key: "semantic", label: "Semantic", color: SERIES_COLORS[1] },
  { key: "keyword", label: "Keyword", color: SERIES_COLORS[2] },
];

export default async function AdminOverviewPage() {
  await requireAdminPage();
  const [totals, visibility, embeddings, daily, queries, gaps, courses, contributors] = await Promise.all([
    platformTotals(),
    documentsByVisibility(),
    embeddingStatusCounts(),
    searchesPerDay(14),
    topQueries(8),
    contentGaps(6),
    courseEngagement(),
    topContributors(6),
  ]);
  const pendingDocs = embeddings.filter((e) => e.label !== "ready").reduce((sum, e) => sum + e.count, 0);
  const refreshedAt = courses[0]?.refreshed_at;

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Platform overview"
        description="Live aggregates from PostgreSQL (GROUP BY, HAVING, FILTER, window functions) plus a materialized view for the heavier per-course numbers."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Students" value={totals.students} hint={`${totals.admins} admin · ${totals.inactive} inactive`} />
        <StatTile label="Notes" value={totals.documents} hint={visibility.map((v) => `${v.count} ${v.label}`).join(" · ")} />
        <StatTile label="Passages" value={totals.chunks} hint={`${totals.embedded_chunks} embedded`} />
        <StatTile label="Groups" value={totals.groups} hint={`${totals.memberships} memberships`} />
        <StatTile label="Saves" value={totals.bookmarks} />
        <StatTile label="Searches" value={totals.searches} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <SectionTitle>Searches per day, by mode</SectionTitle>
          <StackedColumns
            caption="Searches per day over the last 14 days, stacked by search mode"
            series={SERIES}
            data={daily.map((d) => ({ label: d.day.slice(5), values: { hybrid: d.hybrid, semantic: d.semantic, keyword: d.keyword } }))}
          />
        </Card>
        <Card>
          <SectionTitle>Embedding pipeline</SectionTitle>
          <ul className="mb-4 space-y-2 text-sm">
            {embeddings.map((e) => (
              <li key={e.label} className="flex items-center justify-between">
                <Badge tone={e.label === "ready" ? "green" : e.label === "failed" ? "red" : "amber"}>{e.label}</Badge>
                <span className="tabular-nums">{e.count} notes</span>
              </li>
            ))}
          </ul>
          <p className="mb-3 text-xs text-muted">
            {pendingDocs === 0 ? "Every note is searchable by meaning." : `${pendingDocs} note(s) still need vectors.`} The job also embeds logged search queries for the interest profiles.
          </p>
          <ActionButton url="/api/admin/embeddings" variant={pendingDocs > 0 ? "primary" : "secondary"}>
            Run embedding job
          </ActionButton>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            action={
              <ActionButton url="/api/admin/refresh-stats" variant="ghost">
                Refresh view
              </ActionButton>
            }
          >
            Course engagement
          </SectionTitle>
          <p className="-mt-2 mb-4 text-xs text-muted">mv_course_engagement · refreshed {refreshedAt ? `${timeAgo(refreshedAt)} (${formatDate(refreshedAt)})` : "never"}</p>
          <HorizontalBars caption="Notes per course" unit="notes" data={courses.map((c) => ({ label: c.course_code, value: c.documents, hint: c.course_title }))} />
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-ink">View as table</summary>
            <table className="mt-2 w-full text-left">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 font-medium">Course</th>
                  <th className="py-1 text-right font-medium">Students</th>
                  <th className="py-1 text-right font-medium">Notes</th>
                  <th className="py-1 text-right font-medium">Saves</th>
                  <th className="py-1 text-right font-medium">Groups</th>
                  <th className="py-1 text-right font-medium">Members</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {courses.map((c) => (
                  <tr key={c.course_id} className="border-t border-slate-100">
                    <td className="py-1 font-mono">{c.course_code}</td>
                    <td className="py-1 text-right">{c.enrolled_students}</td>
                    <td className="py-1 text-right">{c.documents}</td>
                    <td className="py-1 text-right">{c.bookmarks}</td>
                    <td className="py-1 text-right">{c.study_groups}</td>
                    <td className="py-1 text-right">{c.group_members}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <Card>
          <SectionTitle>Top contributors</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-muted">RANK() OVER (ORDER BY saves received)</p>
          <ol className="space-y-2.5">
            {contributors.map((c) => (
              <li key={c.student_id} className="flex items-center gap-3 text-sm">
                <span className="w-6 font-display text-lg text-brand-600">{c.contribution_rank}</span>
                <span className="flex-1 font-medium">{c.full_name}</span>
                <span className="text-xs text-muted">
                  {c.documents} note{c.documents === 1 ? "" : "s"}
                </span>
                <Badge tone="brand">{c.bookmarks_received} saves</Badge>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>Popular questions</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-muted">GROUP BY LOWER(query_text) HAVING COUNT(*) ≥ 2</p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Query</th>
                <th className="pb-2 text-right font-medium">Times</th>
                <th className="pb-2 text-right font-medium">Students</th>
                <th className="pb-2 text-right font-medium">Avg results</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queries.map((q) => (
                <tr key={q.query}>
                  <td className="py-2 pr-2">{q.query}</td>
                  <td className="py-2 text-right tabular-nums">{q.times}</td>
                  <td className="py-2 text-right tabular-nums">{q.students}</td>
                  <td className="py-2 text-right tabular-nums">{q.avg_results}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <SectionTitle>Content gaps</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-muted">Questions that never returned a note (HAVING MAX(result_count) = 0) — topics to ask faculty or students to cover.</p>
          {gaps.length === 0 ? (
            <p className="text-sm text-muted">No unanswered questions. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {gaps.map((g) => (
                <li key={g.query} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <span>{g.query}</span>
                  <span className="text-xs text-amber-800">
                    {g.times}× by {g.students} student{g.students === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

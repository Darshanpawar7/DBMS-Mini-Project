import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { DocumentCard } from "@/components/document-card";
import { Avatar, Badge, Card, EmptyState, LinkButton, Meter, PageHeader, SectionTitle, StatTile, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { timeAgo } from "@/lib/format";
import { recommendGroups, recommendPartners } from "@/lib/repos/groups";
import { recentSearches } from "@/lib/repos/search";
import { recentFeed, studentStats, trendingTags } from "@/lib/repos/stats";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, feed, groups, partners, tags, searches] = await Promise.all([
    studentStats(user.student_id),
    recentFeed(user.student_id, 6),
    recommendGroups(user.student_id, 3),
    recommendPartners(user.student_id, 4),
    trendingTags(10),
    recentSearches(user.student_id, 5),
  ]);
  const firstName = user.full_name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Good to see you, ${firstName}.`}
        description="New notes from your courses, the study groups that fit your interests, and what everyone is reading."
        actions={<LinkButton href="/documents/new">Upload a note</LinkButton>}
      />

      <form action="/search" className="mb-8 flex gap-2">
        <label htmlFor="dash-q" className="sr-only">
          Search notes
        </label>
        <input id="dash-q" name="q" placeholder="Ask in your own words, e.g. why does my table have duplicate data?" className={`${inputClass} h-12 text-base`} />
        <button className="h-12 shrink-0 rounded-lg bg-ink px-5 text-sm font-medium text-white hover:bg-slate-800">Search</button>
      </form>

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="My notes" value={stats.my_documents} />
        <StatTile label="Saved" value={stats.my_bookmarks} />
        <StatTile label="Groups" value={stats.my_groups} />
        <StatTile label="Courses" value={stats.my_courses} />
        <StatTile label="Searches" value={stats.searches_30d} hint="last 30 days" />
        <StatTile label="Saves received" value={stats.bookmarks_received} hint="on your notes" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0">
          <SectionTitle action={<Link href="/documents" className="text-sm text-brand-600 hover:underline">Open library →</Link>}>
            New in your courses
          </SectionTitle>
          {feed.length === 0 ? (
            <EmptyState title="Nothing new yet" body="Enroll in courses to see notes from your classmates." action={<LinkButton href="/courses" variant="secondary">Choose courses</LinkButton>} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {feed.map((doc) => (
                <DocumentCard key={doc.doc_id} doc={doc} />
              ))}
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-6">
          <Card>
            <SectionTitle>Groups for you</SectionTitle>
            {groups.length === 0 ? (
              <p className="text-sm text-muted">No open groups in your courses right now. Start one from the Study groups page.</p>
            ) : (
              <ul className="space-y-4">
                {groups.map((g) => (
                  <li key={g.group_id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/groups/${g.group_id}`} className="font-medium text-ink hover:text-brand-700">
                          {g.group_name}
                        </Link>
                        <p className="text-xs text-muted">
                          {g.course_code} · {g.member_count} members · {g.seats_left} seats left
                        </p>
                      </div>
                      <ActionButton url={`/api/groups/${g.group_id}/membership`} variant="primary">
                        Join
                      </ActionButton>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                      <span>Match</span>
                      <Meter value={g.match_score} label="Combined match score" />
                    </div>
                    {g.shared_tags.length > 0 && (
                      <p className="mt-1.5 text-xs text-muted">
                        Shared topics: {g.shared_tags.slice(0, 4).map((t) => `#${t}`).join(" ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle>Classmates on your wavelength</SectionTitle>
            {partners.length === 0 ? (
              <p className="text-sm text-muted">Enroll in a course to meet classmates.</p>
            ) : (
              <ul className="space-y-3">
                {partners.map((p) => (
                  <li key={p.student_id} className="flex items-center gap-3">
                    <Avatar name={p.full_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.full_name}</p>
                      <p className="truncate text-xs text-muted">{p.shared_courses.join(", ")}</p>
                    </div>
                    <Meter value={p.similarity} label="Interest similarity" />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle>Trending topics</SectionTitle>
            <ul className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t.tag_name}>
                  <Link href={`/documents?tag=${encodeURIComponent(t.tag_name)}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm hover:border-brand-200 hover:bg-brand-50">
                    #{t.tag_name}
                    <span className="text-xs text-muted">{t.documents}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {searches.length > 0 && (
            <Card>
              <SectionTitle>Your recent searches</SectionTitle>
              <ul className="space-y-2">
                {searches.map((s) => (
                  <li key={s.query_text} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/search?q=${encodeURIComponent(s.query_text)}&mode=${s.search_mode}`} className="truncate text-slate-700 hover:text-brand-700">
                      {s.query_text}
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge>{s.search_mode}</Badge>
                      <span className="text-xs text-muted">{timeAgo(s.searched_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

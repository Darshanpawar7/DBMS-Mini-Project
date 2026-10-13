import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, EmptyState, Meter, PageHeader, SectionTitle, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listMyCourses } from "@/lib/repos/courses";
import { listGroupsForStudent, recommendGroups, type GroupListRow } from "@/lib/repos/groups";
import { GroupForm } from "./group-form";

export const metadata: Metadata = { title: "Study groups" };

function SeatBar({ group }: { group: GroupListRow }) {
  const filled = group.member_count / group.max_members;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <span className={cx("block h-full rounded-full", group.seats_left === 0 ? "bg-red-400" : "bg-emerald-500")} style={{ width: `${filled * 100}%` }} />
      </span>
      {group.member_count}/{group.max_members} seats
    </div>
  );
}

function GroupRow({ group }: { group: GroupListRow }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/groups/${group.group_id}`} className="font-medium text-ink hover:text-brand-700">
            {group.group_name}
          </Link>
          <span className="text-xs font-medium text-brand-700">{group.course_code}</span>
          {group.my_role === "admin" && <Badge tone="brand">You run this</Badge>}
          {group.my_role === "member" && <Badge tone="green">Member</Badge>}
          {group.seats_left === 0 && <Badge tone="red">Full</Badge>}
        </div>
        {group.description && <p className="mt-1 line-clamp-1 text-sm text-muted">{group.description}</p>}
        <div className="mt-2">
          <SeatBar group={group} />
        </div>
      </div>
      <div className="shrink-0">
        {group.my_role ? (
          <ActionButton url={`/api/groups/${group.group_id}/membership`} method="DELETE" confirmText={`Leave ${group.group_name}?`}>
            Leave
          </ActionButton>
        ) : (
          <ActionButton url={`/api/groups/${group.group_id}/membership`} variant="primary">
            Join
          </ActionButton>
        )}
      </div>
    </li>
  );
}

export default async function GroupsPage() {
  const user = await requireUser();
  const [groups, recommended, myCourses] = await Promise.all([
    listGroupsForStudent(user.student_id, user.role === "admin"),
    recommendGroups(user.student_id, 3),
    listMyCourses(user.student_id),
  ]);
  const mine = groups.filter((g) => g.my_role);
  const others = groups.filter((g) => !g.my_role);

  return (
    <>
      <PageHeader
        eyebrow="Study groups"
        title="Learn with the right people"
        description="Seat limits, enrollment checks and admin hand-over are enforced by database triggers — the app cannot overbook a group even if two people click Join at the same moment."
      />

      {recommended.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Best matches for you</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            {recommended.map((g) => (
              <Card key={g.group_id} className="flex flex-col">
                <p className="text-xs font-medium text-brand-700">{g.course_code}</p>
                <Link href={`/groups/${g.group_id}`} className="font-display text-lg font-semibold hover:text-brand-700">
                  {g.group_name}
                </Link>
                <div className="mt-3 space-y-1.5 text-xs text-muted">
                  <div className="flex items-center justify-between">
                    <span>Interest similarity</span>
                    <Meter value={g.similarity} label="Cosine similarity of interest vectors" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Overall match</span>
                    <Meter value={g.match_score} label="0.7 × similarity + 0.3 × topic overlap" />
                  </div>
                </div>
                {g.shared_tags.length > 0 && <p className="mt-3 text-xs text-slate-600">Shared: {g.shared_tags.slice(0, 5).map((t) => `#${t}`).join(" ")}</p>}
                <div className="mt-auto pt-4">
                  <ActionButton url={`/api/groups/${g.group_id}/membership`} variant="primary">
                    Join · {g.seats_left} seat{g.seats_left === 1 ? "" : "s"} left
                  </ActionButton>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <Card>
            <SectionTitle>Your groups</SectionTitle>
            {mine.length === 0 ? <p className="text-sm text-muted">You have not joined a group yet.</p> : <ul className="divide-y divide-slate-100">{mine.map((g) => <GroupRow key={g.group_id} group={g} />)}</ul>}
          </Card>
          <Card>
            <SectionTitle>{user.role === "admin" ? "All other groups" : "Other groups in your courses"}</SectionTitle>
            {others.length === 0 ? (
              <EmptyState title="No other groups yet" body="Be the first to start one for your course." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {others.map((g) => (
                  <GroupRow key={g.group_id} group={g} />
                ))}
              </ul>
            )}
          </Card>
        </div>
        <aside>
          <Card className="lg:sticky lg:top-24">
            <SectionTitle>Start a group</SectionTitle>
            {myCourses.length === 0 ? (
              <p className="text-sm text-muted">
                <Link href="/courses" className="text-brand-600 hover:underline">
                  Enroll in a course
                </Link>{" "}
                first.
              </p>
            ) : (
              <GroupForm courses={myCourses} />
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

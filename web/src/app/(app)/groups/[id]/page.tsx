import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { DocumentCard } from "@/components/document-card";
import { Alert, Avatar, Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { formatDate } from "@/lib/format";
import { canViewGroup, getGroup, groupLibrary, listMembers } from "@/lib/repos/groups";
import { GroupForm } from "../group-form";

export const metadata: Metadata = { title: "Study group" };

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();

  const group = await getGroup(groupId, user.student_id);
  if (!group || !canViewGroup(group, user.role === "admin")) notFound(); // same answer as "does not exist"
  const [members, library] = await Promise.all([listMembers(groupId), groupLibrary(groupId, user.student_id)]);
  const canManage = group.my_role === "admin" || user.role === "admin";

  let joinArea: ReactNode;
  if (group.my_role) {
    joinArea = (
      <ActionButton url={`/api/groups/${groupId}/membership`} method="DELETE" confirmText="Leave this group?" redirectTo="/groups">
        Leave group
      </ActionButton>
    );
  } else if (!group.is_enrolled) {
    joinArea = <Alert tone="amber">Enroll in {group.course_code} to join this group.</Alert>;
  } else {
    joinArea = (
      <ActionButton url={`/api/groups/${groupId}/membership`} variant="primary" size="md">
        {group.seats_left > 0 ? `Join · ${group.seats_left} seats left` : "Join (full — try anyway)"}
      </ActionButton>
    );
  }

  return (
    <>
      <PageHeader eyebrow={`${group.course_code} · ${group.course_title}`} title={group.group_name} description={group.description ?? undefined} actions={joinArea} />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <Card>
            <SectionTitle action={<span className="text-sm text-muted">{group.member_count}/{group.max_members} seats</span>}>Members</SectionTitle>
            <ul className="divide-y divide-slate-100">
              {members.map((m) => (
                <li key={m.student_id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={m.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {m.full_name} {m.student_id === user.student_id && <span className="text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {m.program ?? "—"} · joined {formatDate(m.joined_at)}
                    </p>
                  </div>
                  {m.role === "admin" ? <Badge tone="brand">Group admin</Badge> : <Badge>Member</Badge>}
                  {canManage && m.student_id !== user.student_id && (
                    <span className="flex gap-2">
                      <ActionButton url={`/api/groups/${groupId}/members/${m.student_id}`} method="PATCH" json={{ role: m.role === "admin" ? "member" : "admin" }} variant="ghost">
                        {m.role === "admin" ? "Make member" : "Make admin"}
                      </ActionButton>
                      <ActionButton url={`/api/groups/${groupId}/members/${m.student_id}`} method="DELETE" variant="danger" confirmText={`Remove ${m.full_name} from the group?`}>
                        Remove
                      </ActionButton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <section>
            <SectionTitle>Notes from this group</SectionTitle>
            {library.length === 0 ? (
              <EmptyState title="No notes yet" body={`Notes members upload for ${group.course_code} appear here.`} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {library.map((doc) => (
                  <DocumentCard key={doc.doc_id} doc={doc} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Card>
            <SectionTitle>About</SectionTitle>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Started by</dt>
                <dd className="font-medium">{group.creator_name ?? "a former member"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="font-medium">{formatDate(group.created_at)}</dd>
              </div>
            </dl>
          </Card>
          {canManage && (
            <Card>
              <SectionTitle>Manage group</SectionTitle>
              <GroupForm initial={{ group_id: group.group_id, group_name: group.group_name, description: group.description, max_members: group.max_members }} />
              <div className="mt-6 border-t border-slate-100 pt-4">
                <ActionButton url={`/api/groups/${groupId}`} method="DELETE" variant="danger" confirmText="Delete this group for all members?" redirectTo="/groups">
                  Delete group
                </ActionButton>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

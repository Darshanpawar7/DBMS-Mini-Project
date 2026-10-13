import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Avatar, Badge, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth/current-user";
import { timeAgo } from "@/lib/format";
import { listStudentsForAdmin } from "@/lib/repos/students";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdminPage();
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 100) : undefined;
  const users = await listStudentsForAdmin(search);

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Users and roles"
        description="Promote, deactivate or remove accounts. Every role or status change is written to the audit log by a trigger, with you recorded as the actor."
      />
      <form action="/admin/users" className="mb-4 flex max-w-md gap-2">
        <label htmlFor="user-q" className="sr-only">
          Search users
        </label>
        <input id="user-q" name="q" defaultValue={search} placeholder="Search by name or email" className={inputClass} />
        <button className={buttonClass("secondary")}>Search</button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">User</th>
              <th scope="col" className="px-3 py-3 font-medium">Role</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Notes</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Groups</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Searches</th>
              <th scope="col" className="px-3 py-3 font-medium">Last login</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const isSelf = u.student_id === admin.student_id;
              return (
                <tr key={u.student_id} className={u.is_active ? "" : "bg-slate-50 text-slate-400"}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.full_name} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{u.full_name}</p>
                        <p className="text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex gap-1.5">
                      <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role}</Badge>
                      {!u.is_active && <Badge tone="red">inactive</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.documents}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.groups}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{u.searches}</td>
                  <td className="px-3 py-3 text-xs">{u.last_login_at ? timeAgo(u.last_login_at) : "never"}</td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <p className="text-right text-xs text-muted">This is you</p>
                    ) : (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <ActionButton url={`/api/admin/users/${u.student_id}`} method="PATCH" json={{ role: u.role === "admin" ? "student" : "admin" }} variant="ghost">
                          {u.role === "admin" ? "Make student" : "Make admin"}
                        </ActionButton>
                        <ActionButton url={`/api/admin/users/${u.student_id}`} method="PATCH" json={{ is_active: !u.is_active }} variant="ghost">
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </ActionButton>
                        <ActionButton
                          url={`/api/admin/users/${u.student_id}`}
                          method="DELETE"
                          variant="danger"
                          confirmText={`Delete ${u.full_name}? Their notes are deleted too; groups they created stay with a new admin.`}
                        >
                          Delete
                        </ActionButton>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

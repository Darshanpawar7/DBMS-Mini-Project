import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth/current-user";
import { formatDate, timeAgo } from "@/lib/format";
import { auditLog, type AuditRow } from "@/lib/repos/stats";

export const metadata: Metadata = { title: "Audit log" };

const TABLES = ["student", "document", "course", "study_group"];
const ACTION_TONE = { INSERT: "green", UPDATE: "amber", DELETE: "red" } as const;
const IGNORED_KEYS = new Set(["updated_at", "search_tsv"]);

/** Which columns changed between old and new JSON (or the whole row for INSERT/DELETE). */
function describeChange(row: AuditRow): string {
  if (row.action === "UPDATE" && row.old_data && row.new_data) {
    const changed = Object.keys(row.new_data).filter((k) => !IGNORED_KEYS.has(k) && JSON.stringify(row.old_data?.[k]) !== JSON.stringify(row.new_data?.[k]));
    return changed.map((k) => `${k}: ${JSON.stringify(row.old_data?.[k])} → ${JSON.stringify(row.new_data?.[k])}`).join(" · ") || "no visible change";
  }
  const data = row.new_data ?? row.old_data ?? {};
  const label = data.title ?? data.full_name ?? data.course_code ?? data.group_name;
  return label ? String(label) : "";
}

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdminPage();
  const { table } = await searchParams;
  const selected = typeof table === "string" && TABLES.includes(table) ? table : undefined;
  const rows = await auditLog(100, selected);

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Audit log"
        description="Written only by the fn_audit_row() trigger. The application's database role can insert and read this table but cannot update or delete it."
      />
      <nav aria-label="Filter by table" className="mb-4 flex flex-wrap gap-2">
        {[undefined, ...TABLES].map((t) => (
          <Link
            key={t ?? "all"}
            href={t ? `/admin/audit?table=${t}` : "/admin/audit"}
            className={cx("rounded-full border px-3 py-1 text-sm", selected === t ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:text-ink")}
          >
            {t ?? "all tables"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="Nothing logged yet" body="Change a role, delete a note or create a course and it appears here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">When</th>
                <th scope="col" className="px-3 py-3 font-medium">Action</th>
                <th scope="col" className="px-3 py-3 font-medium">Row</th>
                <th scope="col" className="px-3 py-3 font-medium">By</th>
                <th scope="col" className="px-4 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.audit_id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs" title={formatDate(r.logged_at)}>
                    {timeAgo(r.logged_at)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={ACTION_TONE[r.action as keyof typeof ACTION_TONE] ?? "neutral"}>{r.action}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">
                    {r.table_name}#{r.row_pk}
                  </td>
                  <td className="px-3 py-3 text-xs">{r.actor_name ?? <span className="text-muted">system</span>}</td>
                  <td className="max-w-md px-4 py-3 font-mono text-xs text-slate-600">{describeChange(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

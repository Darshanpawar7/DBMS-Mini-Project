import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listCoursesWithStats } from "@/lib/repos/courses";
import { EnrollControl } from "./enroll-button";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const user = await requireUser();
  const courses = await listCoursesWithStats(user.student_id);
  const enrolledCount = courses.filter((c) => c.my_semesters.length > 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Courses"
        title="Your courses"
        description={`You are enrolled in ${enrolledCount} course${enrolledCount === 1 ? "" : "s"}. Enrollment unlocks course-only notes and lets you join that course's study groups. Dropping a course also removes you from its groups (a database trigger does this).`}
      />
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Course</th>
              <th scope="col" className="hidden px-3 py-3 text-right font-medium md:table-cell">Students</th>
              <th scope="col" className="hidden px-3 py-3 text-right font-medium md:table-cell">Notes</th>
              <th scope="col" className="hidden px-3 py-3 text-right font-medium md:table-cell">Groups</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Enrollment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((c) => (
              <tr key={c.course_id} className="align-top hover:bg-slate-50/60">
                <td className="px-5 py-4">
                  <p className="font-mono text-xs text-brand-700">{c.course_code}</p>
                  <Link href={`/documents?course=${c.course_id}`} className="font-medium text-ink hover:text-brand-700">
                    {c.course_title}
                  </Link>
                  <p className="text-xs text-muted">{c.department}</p>
                </td>
                <td className="hidden px-3 py-4 text-right tabular-nums md:table-cell">{c.enrolled_students}</td>
                <td className="hidden px-3 py-4 text-right tabular-nums md:table-cell">{c.documents}</td>
                <td className="hidden px-3 py-4 text-right tabular-nums md:table-cell">{c.study_groups}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-col items-end gap-2">
                    {c.my_semesters.map((semester) => (
                      <div key={semester} className="flex items-center gap-2">
                        <Badge tone="green">Enrolled · {semester}</Badge>
                        <ActionButton
                          url="/api/enrollments"
                          method="DELETE"
                          json={{ course_id: c.course_id, semester }}
                          variant="ghost"
                          confirmText={`Drop ${c.course_code} (${semester})? You will also leave its study groups.`}
                        >
                          Drop
                        </ActionButton>
                      </div>
                    ))}
                    {c.my_semesters.length === 0 && <EnrollControl courseId={c.course_id} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

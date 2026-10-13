import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth/current-user";
import { listCoursesWithStats } from "@/lib/repos/courses";
import { listTags } from "@/lib/repos/documents";
import { CourseForm, EditCourseToggle, TagMergeForm } from "./admin-forms";

export const metadata: Metadata = { title: "Courses & tags" };

export default async function AdminContentPage() {
  const admin = await requireAdminPage();
  const [courses, tags] = await Promise.all([listCoursesWithStats(admin.student_id), listTags(admin.student_id, 0)]);

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Courses and tags" description="Manage the course catalogue and keep the tag vocabulary tidy." />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Card>
          <SectionTitle>Courses</SectionTitle>
          <ul className="divide-y divide-slate-100">
            {courses.map((c) => (
              <li key={c.course_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-brand-700">{c.course_code}</p>
                  <p className="font-medium">{c.course_title}</p>
                  <p className="text-xs text-muted">
                    {c.department ?? "—"} · {c.enrolled_students} students · {c.documents} notes · {c.study_groups} groups
                  </p>
                </div>
                <EditCourseToggle course={c} />
                <ActionButton
                  url={`/api/admin/courses/${c.course_id}`}
                  method="DELETE"
                  variant="danger"
                  confirmText={`Delete ${c.course_code}? Its enrollments and study groups are removed; its notes stay but become private.`}
                >
                  Delete
                </ActionButton>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-6">
          <Card>
            <SectionTitle>Add a course</SectionTitle>
            <CourseForm />
          </Card>
          <Card>
            <SectionTitle>Merge tags</SectionTitle>
            <p className="-mt-2 mb-3 text-xs text-muted">Runs the stored procedure sp_merge_tags in one transaction.</p>
            <TagMergeForm tags={tags.map((t) => t.tag_name)} />
          </Card>
          <Card>
            <SectionTitle>Tag usage</SectionTitle>
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t.tag_name} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  #{t.tag_name} <span className="text-muted">{t.documents}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

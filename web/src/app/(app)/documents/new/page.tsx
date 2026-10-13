import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listAllCourses, listMyCourses } from "@/lib/repos/courses";
import { DocumentForm } from "../document-form";

export const metadata: Metadata = { title: "Upload a note" };

export default async function NewDocumentPage() {
  const user = await requireUser();
  const courses = user.role === "admin" ? await listAllCourses() : await listMyCourses(user.student_id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Upload"
        title="Share a note"
        description="Saving the note and splitting it into passages (done by a database trigger) happen in one transaction; the passages are then embedded so classmates can find the note by meaning."
      />
      <Card className="p-6">
        <DocumentForm courses={courses} />
      </Card>
    </div>
  );
}

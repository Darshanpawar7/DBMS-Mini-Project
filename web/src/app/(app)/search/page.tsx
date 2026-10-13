import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listAllCourses } from "@/lib/repos/courses";
import { listTags } from "@/lib/repos/documents";
import { runSearch, type SearchResponse } from "@/lib/repos/search";
import { searchSchema } from "@/lib/validation";
import { SearchClient } from "./search-client";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const user = await requireUser();
  const params = await searchParams;
  const parsed = searchSchema.safeParse({ q: params.q, mode: params.mode, course: params.course, tag: params.tag });
  // a shared link such as /search?q=... renders its results on the server
  const [courses, tags, initial] = await Promise.all([
    listAllCourses(),
    listTags(user.student_id, 1),
    parsed.success ? runSearch(user.student_id, parsed.data) : Promise.resolve<SearchResponse | null>(null),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Search"
        title="Ask your notes a question"
        description="Hybrid search blends exact keyword matches (PostgreSQL full-text) with meaning matches (pgvector cosine similarity). Only notes you are allowed to see are ever returned."
      />
      <SearchClient
        courses={courses.map((c) => ({ id: c.course_id, label: `${c.course_code} · ${c.course_title}` }))}
        tags={tags.map((t) => t.tag_name)}
        initialQuery={{
          q: typeof params.q === "string" ? params.q : "",
          mode: parsed.success ? parsed.data.mode : "hybrid",
          course: parsed.success && parsed.data.course ? String(parsed.data.course) : "",
          tag: parsed.success && parsed.data.tag ? parsed.data.tag : "",
        }}
        initialResponse={initial}
      />
    </>
  );
}

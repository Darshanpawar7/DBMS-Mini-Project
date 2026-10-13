"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/components/api-client";
import { Alert, Field, buttonClass, cx, inputClass } from "@/components/ui";
import type { Visibility } from "@/lib/types";

type CourseOption = { course_id: number; course_code: string; course_title: string };

type Initial = {
  doc_id: number;
  title: string;
  description: string | null;
  visibility: Visibility;
  course_id: number | null;
  tags: string[];
};

type Props = { courses: CourseOption[]; initial?: Initial };

const VISIBILITY_HELP: Record<Visibility, string> = {
  public: "Anyone signed in can find and open it.",
  course: "Only students enrolled in the selected course.",
  private: "Only you (and platform admins).",
};

/** Upload (multipart POST /api/documents) or edit metadata (JSON PATCH /api/documents/:id). */
export function DocumentForm({ courses, initial }: Props) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "course");
  const [source, setSource] = useState<"file" | "text">("file");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);
    setFields({});
    const form = new FormData(event.currentTarget);

    const result = isEdit
      ? await apiFetch<{ doc_id: number }>(`/api/documents/${initial?.doc_id}`, {
          method: "PATCH",
          json: {
            title: form.get("title"),
            description: form.get("description"),
            visibility: form.get("visibility"),
            course_id: form.get("course_id"),
            tags: form.get("tags"),
          },
        })
      : await apiFetch<{ doc_id: number; embedded: boolean }>("/api/documents", { form });

    setIsBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      setFields(result.error.fields ?? {});
      return;
    }
    router.push(`/documents/${result.data.doc_id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && <Alert>{error}</Alert>}

      {!isEdit && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium text-slate-700">Content</legend>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
            {(["file", "text"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cx("rounded-md px-3 py-1.5 font-medium", source === s ? "bg-white shadow-sm" : "text-slate-500")}
              >
                {s === "file" ? "Upload a file" : "Paste text"}
              </button>
            ))}
          </div>
          {source === "file" ? (
            <Field label="File (.pdf, .txt or .md, up to 5 MB)" htmlFor="file" error={fields.file}>
              <input id="file" name="file" type="file" accept=".pdf,.txt,.md,.markdown" className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700`} />
            </Field>
          ) : (
            <Field label="Text" htmlFor="text" error={fields.text} hint="Separate paragraphs with a blank line — each passage is embedded separately.">
              <textarea id="text" name="text" rows={10} className={inputClass} />
            </Field>
          )}
        </fieldset>
      )}

      <Field label="Title" htmlFor="title" error={fields.title}>
        <input id="title" name="title" defaultValue={initial?.title} required maxLength={200} className={inputClass} />
      </Field>
      <Field label="Short description" htmlFor="description" error={fields.description}>
        <input id="description" name="description" defaultValue={initial?.description ?? ""} maxLength={500} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course" htmlFor="course_id" error={fields.course_id} hint="Only courses you are enrolled in.">
          <select id="course_id" name="course_id" defaultValue={initial?.course_id ?? ""} className={inputClass}>
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.course_code} · {c.course_title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visibility" htmlFor="visibility" error={fields.visibility} hint={VISIBILITY_HELP[visibility]}>
          <select id="visibility" name="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className={inputClass}>
            <option value="public">Public</option>
            <option value="course">Course only</option>
            <option value="private">Private</option>
          </select>
        </Field>
      </div>

      <Field label="Tags" htmlFor="tags" error={fields.tags ?? fields["tags.0"]} hint="Comma separated, e.g. sql, query tuning, exam prep">
        <input id="tags" name="tags" defaultValue={initial?.tags.join(", ")} className={inputClass} />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={isBusy} className={buttonClass()}>
          {isBusy ? (isEdit ? "Saving…" : "Uploading and embedding…") : isEdit ? "Save changes" : "Upload note"}
        </button>
        <button type="button" onClick={() => router.back()} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

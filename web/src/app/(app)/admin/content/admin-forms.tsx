"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/components/api-client";
import { Alert, Field, buttonClass, inputClass } from "@/components/ui";

function useApiForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  async function send(url: string, method: "POST" | "PATCH", json: unknown, success: string): Promise<boolean> {
    setIsBusy(true);
    setError(null);
    setNotice(null);
    setFields({});
    const result = await apiFetch(url, { method, json });
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      setFields(result.error.fields ?? {});
      return false;
    }
    setNotice(success);
    router.refresh();
    return true;
  }
  return { send, error, notice, fields, isBusy };
}

type CourseInitial = { course_id: number; course_code: string; course_title: string; department: string | null };

/** Create a course (POST) or edit one (PATCH). */
export function CourseForm({ initial, onDone }: { initial?: CourseInitial; onDone?: () => void }) {
  const { send, error, notice, fields, isBusy } = useApiForm();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = { course_code: form.get("course_code"), course_title: form.get("course_title"), department: form.get("department") };
    const ok = initial
      ? await send(`/api/admin/courses/${initial.course_id}`, "PATCH", payload, "Course updated")
      : await send("/api/admin/courses", "POST", payload, "Course created");
    if (ok && !initial) formElement.reset();
    if (ok) onDone?.();
  }

  const idPrefix = initial ? `c${initial.course_id}-` : "new-";
  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="green">{notice}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field label="Code" htmlFor={`${idPrefix}code`} error={fields.course_code}>
          <input id={`${idPrefix}code`} name="course_code" defaultValue={initial?.course_code} placeholder="UE23CS399A" className={inputClass} />
        </Field>
        <Field label="Title" htmlFor={`${idPrefix}title`} error={fields.course_title}>
          <input id={`${idPrefix}title`} name="course_title" defaultValue={initial?.course_title} className={inputClass} />
        </Field>
      </div>
      <Field label="Department" htmlFor={`${idPrefix}dept`} error={fields.department}>
        <input id={`${idPrefix}dept`} name="department" defaultValue={initial?.department ?? ""} className={inputClass} />
      </Field>
      <button type="submit" disabled={isBusy} className={buttonClass("primary", "sm")}>
        {isBusy ? "Saving…" : initial ? "Save" : "Add course"}
      </button>
    </form>
  );
}

/** Inline "Edit" toggle for a course row. */
export function EditCourseToggle({ course }: { course: CourseInitial }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!isOpen) {
    return (
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClass("ghost", "sm")}>
        Edit
      </button>
    );
  }
  return (
    <div className="mt-3 w-full rounded-xl border border-line bg-slate-50 p-4">
      <CourseForm initial={course} onDone={() => setIsOpen(false)} />
      <button type="button" onClick={() => setIsOpen(false)} className="mt-2 text-xs text-muted hover:text-ink">
        Cancel
      </button>
    </div>
  );
}

/** CALL sp_merge_tags through POST /api/admin/tags/merge. */
export function TagMergeForm({ tags }: { tags: string[] }) {
  const { send, error, notice, isBusy } = useApiForm();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get("from") ?? "");
    const into = String(form.get("into") ?? "");
    if (!window.confirm(`Merge #${from} into #${into}? Documents tagged #${from} will be re-tagged and #${from} deleted.`)) return;
    await send("/api/admin/tags/merge", "POST", { from, into }, `Merged #${from} into #${into}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="green">{notice}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Merge this tag" htmlFor="merge-from">
          <select id="merge-from" name="from" className={inputClass} required>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="into this tag" htmlFor="merge-into">
          <select id="merge-into" name="into" className={inputClass} required defaultValue={tags[1]}>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <button type="submit" disabled={isBusy} className={buttonClass("secondary", "sm")}>
        {isBusy ? "Merging…" : "Merge tags"}
      </button>
    </form>
  );
}

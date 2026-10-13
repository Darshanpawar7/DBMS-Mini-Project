"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/components/api-client";
import { Alert, Field, buttonClass, inputClass } from "@/components/ui";

type Props = {
  courses?: { course_id: number; course_code: string; course_title: string }[];
  initial?: { group_id: number; group_name: string; description: string | null; max_members: number };
};

/** Create (POST /api/groups) or edit (PATCH /api/groups/:id) a study group. */
export function GroupForm({ courses = [], initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      group_name: form.get("group_name"),
      description: form.get("description"),
      max_members: Number(form.get("max_members")),
      ...(initial ? {} : { course_id: Number(form.get("course_id")) }),
    };
    setIsBusy(true);
    setError(null);
    setFields({});
    const result = initial
      ? await apiFetch<{ group_id: number }>(`/api/groups/${initial.group_id}`, { method: "PATCH", json: payload })
      : await apiFetch<{ group_id: number }>("/api/groups", { json: payload });
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      setFields(result.error.fields ?? {});
      return;
    }
    if (initial) {
      router.refresh();
      return;
    }
    formElement.reset();
    router.push(`/groups/${result.data.group_id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      <Field label="Group name" htmlFor="group_name" error={fields.group_name}>
        <input id="group_name" name="group_name" defaultValue={initial?.group_name} required maxLength={100} className={inputClass} />
      </Field>
      {!initial && (
        <Field label="Course" htmlFor="course_id" error={fields.course_id} hint="You can only start groups for courses you take.">
          <select id="course_id" name="course_id" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Choose a course
            </option>
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.course_code} · {c.course_title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Seats (2–20)" htmlFor="max_members" error={fields.max_members}>
        <input id="max_members" name="max_members" type="number" min={2} max={20} defaultValue={initial?.max_members ?? 6} className={inputClass} />
      </Field>
      <Field label="What will you work on?" htmlFor="description" error={fields.description}>
        <textarea id="description" name="description" rows={3} maxLength={300} defaultValue={initial?.description ?? ""} className={inputClass} />
      </Field>
      <button type="submit" disabled={isBusy} className={buttonClass()}>
        {isBusy ? "Saving…" : initial ? "Save changes" : "Create group"}
      </button>
    </form>
  );
}

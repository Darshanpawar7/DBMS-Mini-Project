"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/components/api-client";
import { buttonClass, inputClass } from "@/components/ui";

export const SEMESTERS = ["2026-ODD", "2026-EVEN", "2025-EVEN", "2025-ODD"];

/** Pick a semester and enroll (POST /api/enrollments). */
export function EnrollControl({ courseId }: { courseId: number }) {
  const router = useRouter();
  const [semester, setSemester] = useState(SEMESTERS[0]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleEnroll() {
    setIsBusy(true);
    setError(null);
    const result = await apiFetch("/api/enrollments", { json: { course_id: courseId, semester } });
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <select aria-label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)} className={`${inputClass} h-8 w-32 py-0 text-xs`}>
          {SEMESTERS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="button" onClick={handleEnroll} disabled={isBusy} className={buttonClass("primary", "sm")}>
          {isBusy ? "…" : "Enroll"}
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

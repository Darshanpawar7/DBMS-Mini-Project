import { query, queryOne, withTransaction } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { CourseRow } from "@/lib/types";

export interface CourseWithStats extends CourseRow {
  enrolled_students: number;
  documents: number;
  study_groups: number;
  my_semesters: string[];
}

/** Every course with live counts (notes: only those the student may see), plus the student's semesters. */
export function listCoursesWithStats(studentId: number): Promise<CourseWithStats[]> {
  return query<CourseWithStats>(
    `SELECT c.course_id, c.course_code, c.course_title, c.department,
            COUNT(DISTINCT e.student_id)::INT AS enrolled_students,
            (SELECT COUNT(*) FROM DOCUMENT d JOIN fn_visible_doc_ids($1) v ON v.doc_id = d.doc_id
              WHERE d.course_id = c.course_id)::INT AS documents,
            (SELECT COUNT(*) FROM STUDY_GROUP g WHERE g.course_id = c.course_id)::INT AS study_groups,
            COALESCE(array_agg(e.semester ORDER BY e.semester) FILTER (WHERE e.student_id = $1), '{}') AS my_semesters
     FROM COURSE c
     LEFT JOIN ENROLLMENT e ON e.course_id = c.course_id
     GROUP BY c.course_id
     ORDER BY c.course_code`,
    [studentId],
  );
}

export function listAllCourses(): Promise<CourseRow[]> {
  return query<CourseRow>("SELECT course_id, course_code, course_title, department FROM COURSE ORDER BY course_code");
}

export function listMyCourses(studentId: number): Promise<CourseRow[]> {
  return query<CourseRow>(
    `SELECT DISTINCT c.course_id, c.course_code, c.course_title, c.department
     FROM COURSE c JOIN ENROLLMENT e ON e.course_id = c.course_id
     WHERE e.student_id = $1
     ORDER BY c.course_code`,
    [studentId],
  );
}

/** Students may only file notes under a course they are enrolled in (admins under any). */
export async function assertCanUseCourse(user: { student_id: number; role: string }, courseId: number | null): Promise<void> {
  if (courseId === null || user.role === "admin") return;
  const enrolled = await queryOne("SELECT 1 FROM ENROLLMENT WHERE student_id = $1 AND course_id = $2", [user.student_id, courseId]);
  if (!enrolled) {
    throw new ApiError(403, "You can only file notes under courses you are enrolled in", { course_id: "Not enrolled" });
  }
}

export async function enroll(studentId: number, courseId: number, semester: string): Promise<void> {
  await query("INSERT INTO ENROLLMENT (student_id, course_id, semester) VALUES ($1, $2, $3)", [studentId, courseId, semester]);
}

/** Leaving a course also removes the student's memberships in its groups (trigger T10). */
export async function unenroll(studentId: number, courseId: number, semester: string): Promise<boolean> {
  return withTransaction(
    async (client) => {
      const result = await client.query(
        "DELETE FROM ENROLLMENT WHERE student_id = $1 AND course_id = $2 AND semester = $3",
        [studentId, courseId, semester],
      );
      return (result.rowCount ?? 0) > 0;
    },
    { actorId: studentId },
  );
}

// ---------------------------------------------------------------- admin

export interface CourseInput {
  course_code: string;
  course_title: string;
  department: string | null;
}

export async function createCourse(actorId: number, input: CourseInput): Promise<CourseRow> {
  return withTransaction(
    async (client) => {
      const { rows } = await client.query<CourseRow>(
        `INSERT INTO COURSE (course_code, course_title, department) VALUES ($1, $2, $3)
         RETURNING course_id, course_code, course_title, department`,
        [input.course_code, input.course_title, input.department],
      );
      return rows[0];
    },
    { actorId },
  );
}

export async function updateCourse(actorId: number, courseId: number, input: CourseInput): Promise<boolean> {
  return withTransaction(
    async (client) => {
      const result = await client.query(
        "UPDATE COURSE SET course_code = $2, course_title = $3, department = $4 WHERE course_id = $1",
        [courseId, input.course_code, input.course_title, input.department],
      );
      return (result.rowCount ?? 0) > 0;
    },
    { actorId },
  );
}

/** Groups and enrollments cascade; documents keep existing (course set NULL, 'course' visibility -> 'private'). */
export async function deleteCourse(actorId: number, courseId: number): Promise<boolean> {
  return withTransaction(
    async (client) => {
      const result = await client.query("DELETE FROM COURSE WHERE course_id = $1", [courseId]);
      return (result.rowCount ?? 0) > 0;
    },
    { actorId },
  );
}

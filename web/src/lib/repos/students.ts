import { query, queryOne, withTransaction } from "@/lib/db";
import type { Role } from "@/lib/auth/token";
import { ApiError } from "@/lib/errors";

export interface SessionUser {
  student_id: number;
  full_name: string;
  email: string;
  role: Role;
  program: string | null;
  year_of_study: number | null;
}

export interface StudentAuthRow extends SessionUser {
  password_hash: string;
  is_active: boolean;
}

const SESSION_COLUMNS = "student_id, full_name, email, role, program, year_of_study";

export function findActiveStudentById(id: number): Promise<SessionUser | null> {
  return queryOne<SessionUser>(`SELECT ${SESSION_COLUMNS} FROM STUDENT WHERE student_id = $1 AND is_active`, [id]);
}

export function findStudentForLogin(email: string): Promise<StudentAuthRow | null> {
  return queryOne<StudentAuthRow>(
    `SELECT ${SESSION_COLUMNS}, password_hash, is_active FROM STUDENT WHERE LOWER(email) = LOWER($1)`,
    [email],
  );
}

export async function recordLogin(id: number): Promise<void> {
  await query("UPDATE STUDENT SET last_login_at = CURRENT_TIMESTAMP WHERE student_id = $1", [id]);
}

export interface NewStudent {
  full_name: string;
  email: string;
  password_hash: string;
  program: string | null;
  year_of_study: number | null | undefined;
}

export async function createStudent(input: NewStudent): Promise<SessionUser> {
  const row = await queryOne<SessionUser>(
    `INSERT INTO STUDENT (full_name, email, password_hash, program, year_of_study)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SESSION_COLUMNS}`,
    [input.full_name, input.email, input.password_hash, input.program, input.year_of_study ?? null],
  );
  if (!row) throw new Error("Insert returned no row");
  return row;
}

// ---------------------------------------------------------------- admin

export interface AdminStudentRow {
  student_id: number;
  full_name: string;
  email: string;
  role: Role;
  program: string | null;
  year_of_study: number | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  documents: number;
  groups: number;
  searches: number;
}

export function listStudentsForAdmin(search: string | undefined): Promise<AdminStudentRow[]> {
  return query<AdminStudentRow>(
    `SELECT s.student_id, s.full_name, s.email, s.role, s.program, s.year_of_study, s.is_active,
            s.created_at, s.last_login_at,
            (SELECT COUNT(*) FROM DOCUMENT d WHERE d.student_id = s.student_id)::INT          AS documents,
            (SELECT COUNT(*) FROM GROUP_MEMBERSHIP m WHERE m.student_id = s.student_id)::INT  AS groups,
            (SELECT COUNT(*) FROM SEARCH_LOG l WHERE l.student_id = s.student_id)::INT        AS searches
     FROM STUDENT s
     WHERE $1::TEXT IS NULL OR s.full_name ILIKE '%' || $1 || '%' OR s.email ILIKE '%' || $1 || '%'
     ORDER BY s.role, s.full_name`,
    [search || null],
  );
}

export async function updateStudentByAdmin(
  actorId: number,
  studentId: number,
  changes: { role?: Role; is_active?: boolean },
): Promise<void> {
  await withTransaction(
    async (client) => {
      const result = await client.query(
        `UPDATE STUDENT
         SET role = COALESCE($2, role), is_active = COALESCE($3, is_active)
         WHERE student_id = $1`,
        [studentId, changes.role ?? null, changes.is_active ?? null],
      );
      if (result.rowCount === 0) throw new ApiError(404, "Student not found");
    },
    { actorId },
  );
}

export async function deleteStudentByAdmin(actorId: number, studentId: number): Promise<boolean> {
  return withTransaction(
    async (client) => {
      const result = await client.query("DELETE FROM STUDENT WHERE student_id = $1", [studentId]);
      return (result.rowCount ?? 0) > 0;
    },
    { actorId },
  );
}

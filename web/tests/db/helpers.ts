import { Pool, type PoolClient } from "pg";

// Connects as the app's least-privilege role (DATABASE_URL from .env.local).
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

/** Run a test body inside BEGIN ... ROLLBACK so the database is left untouched. */
export async function inRolledBackTx<T>(body: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    return await body(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

export interface SqlFailure {
  code: string;
  message: string;
  constraint?: string;
}

/**
 * Run a statement that is expected to fail, inside a SAVEPOINT so the
 * surrounding transaction stays usable. Returns the error (or null on success).
 */
export async function attempt(client: PoolClient, sql: string, params: unknown[] = []): Promise<SqlFailure | null> {
  await client.query("SAVEPOINT attempt");
  try {
    await client.query(sql, params);
    await client.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    const e = error as SqlFailure;
    return { code: e.code, message: e.message, constraint: e.constraint };
  }
}

export async function scalar<T>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await client.query(sql, params);
  return Object.values(rows[0] ?? {})[0] as T;
}

export const studentId = (client: PoolClient, handle: string) =>
  scalar<number>(client, "SELECT student_id FROM STUDENT WHERE email = $1", [`${handle}@scholarmesh.test`]);

export const courseId = (client: PoolClient, code: string) => scalar<number>(client, "SELECT course_id FROM COURSE WHERE course_code = $1", [code]);

export const docId = (client: PoolClient, slug: string) => scalar<number>(client, "SELECT doc_id FROM DOCUMENT WHERE file_path = $1", [`seed/${slug}.md`]);

export const groupId = (client: PoolClient, name: string) => scalar<number>(client, "SELECT group_id FROM STUDY_GROUP WHERE group_name = $1", [name]);

export const VALID_HASH = "$2b$10$eVEm2DOaG1Mk25bD3vc1S.Z4KRSeUUpEoi3fI96MSZ4m1SKHpDRbK";

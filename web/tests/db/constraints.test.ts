import { afterAll, describe, expect, test } from "vitest";
import { VALID_HASH, attempt, courseId, inRolledBackTx, pool, scalar, studentId } from "./helpers";

afterAll(() => pool.end());

// Database-level validation: every rule here is a CHECK / UNIQUE / FK in db/0x_*.sql
describe("STUDENT constraints", () => {
  test("rejects an invalid email (chk_student_email)", async () => {
    await inRolledBackTx(async (c) => {
      const err = await attempt(c, "INSERT INTO STUDENT (full_name, email, password_hash) VALUES ('Test User', 'not-an-email', $1)", [VALID_HASH]);
      expect(err?.constraint).toBe("chk_student_email");
    });
  });

  test("rejects a plain-text password (chk_student_pwd_bcrypt)", async () => {
    await inRolledBackTx(async (c) => {
      const err = await attempt(c, "INSERT INTO STUDENT (full_name, email, password_hash) VALUES ('Test User', 'plain@scholarmesh.test', 'Scholar@123')");
      expect(err?.constraint).toBe("chk_student_pwd_bcrypt");
    });
  });

  test("email uniqueness ignores case and whitespace (unique index + normalise trigger)", async () => {
    await inRolledBackTx(async (c) => {
      const err = await attempt(c, "INSERT INTO STUDENT (full_name, email, password_hash) VALUES ('Copy Cat', '  DARSHAN.Pawar@ScholarMesh.test ', $1)", [VALID_HASH]);
      expect(err?.code).toBe("23505");
      expect(err?.constraint).toBe("uq_student_email_ci");
    });
  });

  test("role and year_of_study are restricted", async () => {
    await inRolledBackTx(async (c) => {
      expect((await attempt(c, "UPDATE STUDENT SET role = 'superuser' WHERE email = 'darshan.pawar@scholarmesh.test'"))?.constraint).toBe("chk_student_role");
      expect((await attempt(c, "UPDATE STUDENT SET year_of_study = 9 WHERE email = 'darshan.pawar@scholarmesh.test'"))?.code).toBe("23514");
    });
  });
});

describe("DOCUMENT constraints", () => {
  test("course-only visibility requires a course (chk_document_course_vis)", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "darshan.pawar");
      const err = await attempt(c, "INSERT INTO DOCUMENT (title, file_path, file_type, visibility, content, student_id) VALUES ('Lonely', 'x.md', 'md', 'course', 'text', $1)", [me]);
      expect(err?.constraint).toBe("chk_document_course_vis");
    });
  });

  test("file type and visibility are whitelisted", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "darshan.pawar");
      const exe = await attempt(c, "INSERT INTO DOCUMENT (title, file_path, file_type, content, student_id) VALUES ('Virus', 'x.exe', 'exe', 'text', $1)", [me]);
      expect(exe?.constraint).toBe("chk_document_file_type");
      const vis = await attempt(c, "INSERT INTO DOCUMENT (title, file_path, file_type, visibility, content, student_id) VALUES ('Shared', 'x.md', 'md', 'world', 'text', $1)", [me]);
      expect(vis?.code).toBe("23514");
    });
  });

  test("a document must belong to an existing student (foreign key)", async () => {
    await inRolledBackTx(async (c) => {
      const err = await attempt(c, "INSERT INTO DOCUMENT (title, file_path, file_type, content, student_id) VALUES ('Orphan', 'x.md', 'md', 'text', 999999)");
      expect(err?.code).toBe("23503");
    });
  });
});

describe("other tables", () => {
  test("semester format, duplicate enrollment, tag format, group size", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "darshan.pawar");
      const os = await courseId(c, "UE23CS342A");
      const dbms = await courseId(c, "UE23CS351A");
      expect((await attempt(c, "INSERT INTO ENROLLMENT VALUES ($1, $2, 'Fall-2026')", [me, os]))?.constraint).toBe("chk_enrollment_semester");
      expect((await attempt(c, "INSERT INTO ENROLLMENT VALUES ($1, $2, '2026-ODD')", [me, dbms]))?.code).toBe("23505");
      expect((await attempt(c, "INSERT INTO TAG (tag_name) VALUES ('bad/tag!')"))?.constraint).toBe("chk_tag_name");
      expect((await attempt(c, "INSERT INTO STUDY_GROUP (group_name, max_members, course_id, created_by) VALUES ('Huge group', 50, $1, $2)", [dbms, me]))?.constraint).toBe("chk_group_max_members");
    });
  });

  test("tag names are normalised by trigger before the CHECK runs", async () => {
    await inRolledBackTx(async (c) => {
      const name = await scalar<string>(c, "INSERT INTO TAG (tag_name) VALUES ('  Query   Tuning ') RETURNING tag_name");
      expect(name).toBe("query-tuning");
    });
  });

  test("group names are unique per course", async () => {
    await inRolledBackTx(async (c) => {
      const creator = await studentId(c, "diya.shah");
      const dbms = await courseId(c, "UE23CS351A");
      const err = await attempt(c, "INSERT INTO STUDY_GROUP (group_name, course_id, created_by) VALUES ('Normal Form Ninjas', $1, $2)", [dbms, creator]);
      expect(err?.constraint).toBe("uq_group_name_per_course");
    });
  });
});

import { afterAll, describe, expect, test } from "vitest";
import { attempt, courseId, docId, groupId, inRolledBackTx, pool, scalar, studentId } from "./helpers";

afterAll(() => pool.end());

describe("document triggers", () => {
  test("T4 splits content into chunks and T3 marks the document pending", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "darshan.pawar");
      const paragraph = "Indexes trade write speed for read speed. ".repeat(30);
      const id = await scalar<number>(
        c,
        "INSERT INTO DOCUMENT (title, file_path, file_type, visibility, content, student_id) VALUES ('Chunk test', 't.md', 'md', 'private', $1, $2) RETURNING doc_id",
        [`${paragraph}\n\nShort second paragraph.`, me],
      );
      const chunks = await c.query("SELECT chunk_index, length(chunk_text) AS len FROM DOC_CHUNK WHERE doc_id = $1 ORDER BY chunk_index", [id]);
      expect(chunks.rowCount).toBeGreaterThanOrEqual(2);
      expect(chunks.rows.every((r) => r.len <= 800)).toBe(true);
      expect(await scalar(c, "SELECT embedding_status FROM DOCUMENT WHERE doc_id = $1", [id])).toBe("pending");
    });
  });

  test("editing content re-chunks; editing only the title does not", async () => {
    await inRolledBackTx(async (c) => {
      const id = await docId(c, "dns-resolution");
      const before = await scalar<number>(c, "SELECT MIN(chunk_id) FROM DOC_CHUNK WHERE doc_id = $1", [id]);
      await c.query("UPDATE DOCUMENT SET title = 'DNS lookups, step by step' WHERE doc_id = $1", [id]);
      expect(await scalar(c, "SELECT MIN(chunk_id) FROM DOC_CHUNK WHERE doc_id = $1", [id])).toBe(before);
      expect(await scalar(c, "SELECT embedding_status FROM DOCUMENT WHERE doc_id = $1", [id])).toBe("ready");

      await c.query("UPDATE DOCUMENT SET content = 'Completely new text about DNS caching and TTL values.' WHERE doc_id = $1", [id]);
      expect(await scalar<number>(c, "SELECT COUNT(*)::INT FROM DOC_CHUNK WHERE doc_id = $1", [id])).toBe(1);
      expect(await scalar(c, "SELECT embedding_status FROM DOCUMENT WHERE doc_id = $1", [id])).toBe("pending");
    });
  });

  test("bookkeeping updates (embedding status) do not change 'last edited'", async () => {
    await inRolledBackTx(async (c) => {
      const id = await docId(c, "dns-resolution");
      const before = await scalar<string>(c, "SELECT updated_at::TEXT FROM DOCUMENT WHERE doc_id = $1", [id]);
      await c.query("UPDATE DOCUMENT SET embedding_status = 'ready' WHERE doc_id = $1", [id]);
      expect(await scalar(c, "SELECT updated_at::TEXT FROM DOCUMENT WHERE doc_id = $1", [id])).toBe(before);
      await c.query("UPDATE DOCUMENT SET description = 'Edited' WHERE doc_id = $1", [id]);
      expect(await scalar(c, "SELECT updated_at::TEXT FROM DOCUMENT WHERE doc_id = $1", [id])).not.toBe(before);
    });
  });

  test("deleting a course turns its course-only notes private instead of failing", async () => {
    await inRolledBackTx(async (c) => {
      const id = await docId(c, "routing-algorithms"); // course-only, Computer Networks
      await c.query("DELETE FROM COURSE WHERE course_code = 'UE23CS341A'");
      const row = await c.query("SELECT visibility, course_id FROM DOCUMENT WHERE doc_id = $1", [id]);
      expect(row.rows[0]).toEqual({ visibility: "private", course_id: null });
    });
  });
});

describe("study-group triggers", () => {
  test("T6 makes the creator the group admin", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "darshan.pawar");
      const gid = await scalar<number>(c, "INSERT INTO STUDY_GROUP (group_name, course_id, created_by) VALUES ('Trigger test', $1, $2) RETURNING group_id", [await courseId(c, "UE23CS352A"), me]);
      const members = await c.query("SELECT student_id, role FROM GROUP_MEMBERSHIP WHERE group_id = $1", [gid]);
      expect(members.rows).toEqual([{ student_id: me, role: "admin" }]);
    });
  });

  test("T5 refuses a member who is not enrolled in the course (SM002)", async () => {
    await inRolledBackTx(async (c) => {
      const outsider = await studentId(c, "arjun.mehta"); // not enrolled in DBMS
      const err = await attempt(c, "INSERT INTO GROUP_MEMBERSHIP (group_id, student_id) VALUES ($1, $2)", [await groupId(c, "Normal Form Ninjas"), outsider]);
      expect(err?.code).toBe("SM002");
    });
  });

  test("T5 refuses to overfill a group (SM001)", async () => {
    await inRolledBackTx(async (c) => {
      const full = await groupId(c, "Query Optimizers"); // 4 of 4
      const err = await attempt(c, "INSERT INTO GROUP_MEMBERSHIP (group_id, student_id) VALUES ($1, $2)", [full, await studentId(c, "tanvi.hegde")]);
      expect(err?.code).toBe("SM001");
      expect(err?.message).toContain("4 of 4");
    });
  });

  test("T8 blocks demoting the last admin (SM003)", async () => {
    await inRolledBackTx(async (c) => {
      const gid = await groupId(c, "Kernel Panic");
      const err = await attempt(c, "UPDATE GROUP_MEMBERSHIP SET role = 'member' WHERE group_id = $1 AND role = 'admin'", [gid]);
      expect(err?.code).toBe("SM003");
    });
  });

  test("T7 promotes the longest-standing member when the admin leaves", async () => {
    await inRolledBackTx(async (c) => {
      const gid = await groupId(c, "Packet Pushers");
      const admin = await scalar<number>(c, "SELECT student_id FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND role = 'admin'", [gid]);
      const expected = await scalar<number>(
        c,
        "SELECT student_id FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND role = 'member' ORDER BY joined_at, student_id LIMIT 1",
        [gid],
      );
      await c.query("DELETE FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND student_id = $2", [gid, admin]);
      expect(await scalar(c, "SELECT student_id FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND role = 'admin'", [gid])).toBe(expected);
    });
  });

  test("T7 deletes a group when its last member leaves", async () => {
    await inRolledBackTx(async (c) => {
      const gid = await groupId(c, "Kernel Panic");
      await c.query("DELETE FROM GROUP_MEMBERSHIP WHERE group_id = $1", [gid]);
      expect(await scalar<number>(c, "SELECT COUNT(*)::INT FROM STUDY_GROUP WHERE group_id = $1", [gid])).toBe(0);
    });
  });

  test("deleting the creator's account keeps the group (created_by SET NULL)", async () => {
    await inRolledBackTx(async (c) => {
      const gid = await groupId(c, "DP on Trees");
      await c.query("DELETE FROM STUDENT WHERE email = 'nikhil.bhat@scholarmesh.test'");
      const row = await c.query("SELECT created_by FROM STUDY_GROUP WHERE group_id = $1", [gid]);
      expect(row.rows[0].created_by).toBeNull();
      expect(await scalar<number>(c, "SELECT COUNT(*)::INT FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND role = 'admin'", [gid])).toBe(1);
    });
  });

  test("T9 blocks shrinking max_members below the member count (SM004)", async () => {
    await inRolledBackTx(async (c) => {
      const err = await attempt(c, "UPDATE STUDY_GROUP SET max_members = 2 WHERE group_name = 'Normal Form Ninjas'");
      expect(err?.code).toBe("SM004");
    });
  });

  test("T10 dropping a course also leaves its study groups", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "darshan.pawar");
      const gid = await groupId(c, "DP on Trees");
      await c.query("DELETE FROM ENROLLMENT WHERE student_id = $1 AND course_id = $2", [me, await courseId(c, "UE23CS343A")]);
      expect(await scalar<number>(c, "SELECT COUNT(*)::INT FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND student_id = $2", [gid, me])).toBe(0);
    });
  });
});

describe("audit trigger (T11)", () => {
  test("records the acting user from app.current_user_id and strips secrets", async () => {
    await inRolledBackTx(async (c) => {
      const admin = await scalar<number>(c, "SELECT student_id FROM STUDENT WHERE role = 'admin' LIMIT 1");
      const target = await studentId(c, "rohan.gupta");
      await c.query("SELECT set_config('app.current_user_id', $1, true)", [String(admin)]);
      await c.query("UPDATE STUDENT SET is_active = FALSE WHERE student_id = $1", [target]);
      const row = await c.query("SELECT action, actor_id, row_pk, old_data, new_data FROM AUDIT_LOG ORDER BY audit_id DESC LIMIT 1");
      expect(row.rows[0]).toMatchObject({ action: "UPDATE", actor_id: admin, row_pk: String(target) });
      expect(row.rows[0].new_data.is_active).toBe(false);
      expect(row.rows[0].new_data).not.toHaveProperty("password_hash");
    });
  });
});

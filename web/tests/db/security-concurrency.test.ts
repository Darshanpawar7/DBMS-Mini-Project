import { afterAll, describe, expect, test } from "vitest";
import { attempt, courseId, inRolledBackTx, pool, scalar, studentId } from "./helpers";

afterAll(() => pool.end());

describe("least-privilege application role", () => {
  test("cannot drop or alter tables", async () => {
    await inRolledBackTx(async (c) => {
      expect((await attempt(c, "DROP TABLE BOOKMARK"))?.code).toBe("42501"); // insufficient_privilege
      expect((await attempt(c, "ALTER TABLE STUDENT ADD COLUMN hacked BOOLEAN"))?.code).toBe("42501");
    });
  });

  test("can append to the audit log but never edit or erase it", async () => {
    await inRolledBackTx(async (c) => {
      expect((await attempt(c, "UPDATE AUDIT_LOG SET action = 'INSERT'"))?.code).toBe("42501");
      expect((await attempt(c, "DELETE FROM AUDIT_LOG"))?.code).toBe("42501");
    });
  });

  test("can refresh the materialized view only through the SECURITY DEFINER function", async () => {
    await inRolledBackTx(async (c) => {
      expect((await attempt(c, "REFRESH MATERIALIZED VIEW mv_course_engagement"))?.code).toBe("42501");
      expect(await attempt(c, "SELECT fn_refresh_course_stats()")).toBeNull();
    });
  });
});

describe("transactions", () => {
  test("a failing statement rolls back the whole unit of work", async () => {
    const client = await pool.connect();
    try {
      const me = await scalar<number>(client, "SELECT student_id FROM STUDENT WHERE email = 'darshan.pawar@scholarmesh.test'");
      const before = await scalar<number>(client, "SELECT COUNT(*)::INT FROM DOCUMENT");
      await client.query("BEGIN");
      await client.query("INSERT INTO DOCUMENT (title, file_path, file_type, content, student_id) VALUES ('Half saved', 'h.md', 'md', 'some text', $1)", [me]);
      await expect(client.query("INSERT INTO DOCUMENT_TAG (doc_id, tag_id) VALUES (-1, -1)")).rejects.toMatchObject({ code: "23503" });
      await client.query("ROLLBACK");
      expect(await scalar<number>(client, "SELECT COUNT(*)::INT FROM DOCUMENT")).toBe(before);
    } finally {
      client.release();
    }
  });

  test("two students racing for the last seat: exactly one gets it", async () => {
    // committed setup: a 2-seat ML group whose creator holds one seat
    const setup = await pool.connect();
    let gid = 0;
    try {
      const creator = await studentId(setup, "meera.pillai");
      gid = await scalar<number>(
        setup,
        "INSERT INTO STUDY_GROUP (group_name, max_members, course_id, created_by) VALUES ('Race condition test', 2, $1, $2) RETURNING group_id",
        [await courseId(setup, "UE23CS352A"), creator],
      );
      const racers = [await studentId(setup, "priya.nair"), await studentId(setup, "ishita.das")];

      const [a, b] = await Promise.all([pool.connect(), pool.connect()]);
      try {
        await Promise.all([a.query("BEGIN"), b.query("BEGIN")]);
        const results = await Promise.allSettled([
          a.query("CALL sp_join_group($1, $2)", [racers[0], gid]).then(() => a.query("COMMIT")),
          b.query("CALL sp_join_group($1, $2)", [racers[1], gid]).then(() => b.query("COMMIT")),
        ]);
        await Promise.all([a.query("ROLLBACK").catch(() => undefined), b.query("ROLLBACK").catch(() => undefined)]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason.code).toBe("SM001");
        expect(await scalar<number>(setup, "SELECT COUNT(*)::INT FROM GROUP_MEMBERSHIP WHERE group_id = $1", [gid])).toBe(2);
      } finally {
        a.release();
        b.release();
      }
    } finally {
      if (gid) await setup.query("DELETE FROM STUDY_GROUP WHERE group_id = $1", [gid]);
      setup.release();
    }
  });

  test("the last two members leaving at the same moment never leave an orphan group", async () => {
    const setup = await pool.connect();
    let gid = 0;
    try {
      const creator = await studentId(setup, "meera.pillai");
      const other = await studentId(setup, "priya.nair");
      gid = await scalar<number>(
        setup,
        "INSERT INTO STUDY_GROUP (group_name, max_members, course_id, created_by) VALUES ('Leave race test', 4, $1, $2) RETURNING group_id",
        [await courseId(setup, "UE23CS352A"), creator],
      );
      await setup.query("CALL sp_join_group($1, $2)", [other, gid]);

      const [a, b] = await Promise.all([pool.connect(), pool.connect()]);
      try {
        await Promise.all([a.query("BEGIN"), b.query("BEGIN")]);
        const results = await Promise.allSettled([
          a.query("CALL sp_leave_group($1, $2)", [creator, gid]).then(() => a.query("COMMIT")),
          b.query("CALL sp_leave_group($1, $2)", [other, gid]).then(() => b.query("COMMIT")),
        ]);
        expect(results.every((r) => r.status === "fulfilled")).toBe(true);
        // T7 ran in both transactions, one after the other: the group is gone, not left empty
        expect(await scalar<number>(setup, "SELECT COUNT(*)::INT FROM STUDY_GROUP WHERE group_id = $1", [gid])).toBe(0);
        gid = 0;
      } finally {
        a.release();
        b.release();
      }
    } finally {
      if (gid) await setup.query("DELETE FROM STUDY_GROUP WHERE group_id = $1", [gid]);
      setup.release();
    }
  });
});

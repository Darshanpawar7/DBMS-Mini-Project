import { afterAll, describe, expect, test } from "vitest";
import { attempt, courseId, docId, groupId, inRolledBackTx, pool, scalar, studentId } from "./helpers";

afterAll(() => pool.end());

describe("access control (fn_visible_doc_ids)", () => {
  test("another student's private note is invisible; your own is visible", async () => {
    await inRolledBackTx(async (c) => {
      const ananya = await studentId(c, "ananya.rao");
      const kavya = await studentId(c, "kavya.menon");
      const privateNote = await docId(c, "kmeans-clustering"); // Kavya's private note
      expect(await scalar(c, "SELECT fn_can_view_document($1, $2)", [ananya, privateNote])).toBe(false);
      expect(await scalar(c, "SELECT fn_can_view_document($1, $2)", [kavya, privateNote])).toBe(true);
    });
  });

  test("course-only notes are visible to enrolled students only", async () => {
    await inRolledBackTx(async (c) => {
      const routing = await docId(c, "routing-algorithms"); // course-only, Computer Networks
      expect(await scalar(c, "SELECT fn_can_view_document($1, $2)", [await studentId(c, "rahul.verma"), routing])).toBe(true); // enrolled
      expect(await scalar(c, "SELECT fn_can_view_document($1, $2)", [await studentId(c, "ananya.rao"), routing])).toBe(false); // not enrolled
    });
  });

  test("admins see every document", async () => {
    await inRolledBackTx(async (c) => {
      const admin = await scalar<number>(c, "SELECT student_id FROM STUDENT WHERE role = 'admin' LIMIT 1");
      const visible = await scalar<number>(c, "SELECT COUNT(*)::INT FROM fn_visible_doc_ids($1)", [admin]);
      expect(visible).toBe(await scalar<number>(c, "SELECT COUNT(*)::INT FROM DOCUMENT"));
    });
  });

  test("search never returns a document the student cannot see", async () => {
    await inRolledBackTx(async (c) => {
      const ananya = await studentId(c, "ananya.rao");
      // use the private note's own embedding as the query: the perfect match must still be hidden
      const vec = await scalar<string>(c, "SELECT embedding::TEXT FROM DOC_CHUNK WHERE doc_id = $1 ORDER BY chunk_index LIMIT 1", [await docId(c, "kmeans-clustering")]);
      const hits = await c.query("SELECT doc_id FROM fn_semantic_search($1, $2::vector, 20, 0.0)", [ananya, vec]);
      const visible = await c.query("SELECT doc_id FROM fn_visible_doc_ids($1)", [ananya]);
      const allowed = new Set(visible.rows.map((r) => r.doc_id));
      expect(hits.rows.every((r) => allowed.has(r.doc_id))).toBe(true);
      expect(hits.rows.map((r) => r.doc_id)).not.toContain(await docId(c, "kmeans-clustering"));
    });
  });
});

describe("search functions", () => {
  test("keyword search finds exact terms and returns highlight markers", async () => {
    await inRolledBackTx(async (c) => {
      const hits = await c.query("SELECT doc_id, snippet FROM fn_keyword_search($1, 'BCNF', 5)", [await studentId(c, "ananya.rao")]);
      expect(hits.rows[0].doc_id).toBe(await docId(c, "normalization-1nf-bcnf"));
      expect(hits.rows[0].snippet).toContain("⟦");
    });
  });

  test("semantic search ranks a document first for its own passage (similarity ≈ 1)", async () => {
    await inRolledBackTx(async (c) => {
      const target = await docId(c, "transformers-self-attention");
      const vec = await scalar<string>(c, "SELECT embedding::TEXT FROM DOC_CHUNK WHERE doc_id = $1 ORDER BY chunk_index LIMIT 1", [target]);
      const hits = await c.query("SELECT doc_id, similarity FROM fn_semantic_search($1, $2::vector, 3)", [await studentId(c, "ananya.rao"), vec]);
      expect(hits.rows[0].doc_id).toBe(target);
      expect(hits.rows[0].similarity).toBeGreaterThan(0.99);
    });
  });

  test("hybrid search fuses both rankings (RRF)", async () => {
    await inRolledBackTx(async (c) => {
      const target = await docId(c, "normalization-1nf-bcnf");
      const vec = await scalar<string>(c, "SELECT embedding::TEXT FROM DOC_CHUNK WHERE doc_id = $1 ORDER BY chunk_index LIMIT 1", [target]);
      const hits = await c.query("SELECT doc_id, keyword_rank, semantic_rank, score FROM fn_hybrid_search($1, 'BCNF', $2::vector, 5)", [await studentId(c, "ananya.rao"), vec]);
      expect(hits.rows[0]).toMatchObject({ doc_id: target, keyword_rank: 1, semantic_rank: 1 });
      expect(hits.rows[0].score).toBeCloseTo(2 / 61, 5);
    });
  });

  test("course and tag filters narrow every search", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "ananya.rao");
      const os = await courseId(c, "UE23CS342A");
      const hits = await c.query("SELECT d.course_id FROM fn_keyword_search($1, 'deadlock', 10, $2) k JOIN DOCUMENT d USING (doc_id)", [me, os]);
      expect(hits.rows.every((r) => r.course_id === os)).toBe(true);
    });
  });

  test("fn_chunk_text never exceeds the limit and keeps every word", async () => {
    await inRolledBackTx(async (c) => {
      const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
      const rows = await c.query("SELECT chunk_text FROM fn_chunk_text($1, 200) ORDER BY chunk_index", [text]);
      expect(rows.rows.every((r) => r.chunk_text.length <= 200)).toBe(true);
      expect(rows.rows.map((r) => r.chunk_text).join(" ")).toBe(text);
    });
  });
});

describe("recommendations", () => {
  test("only open groups in the student's courses that they have not joined", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "ananya.rao");
      const recs = await c.query("SELECT group_id, seats_left, similarity, match_score FROM fn_recommend_groups($1, 10)", [me]);
      const mine = await c.query("SELECT group_id FROM GROUP_MEMBERSHIP WHERE student_id = $1", [me]);
      const myGroups = new Set(mine.rows.map((r) => r.group_id));
      expect(recs.rowCount).toBeGreaterThan(0);
      for (const r of recs.rows) {
        expect(myGroups.has(r.group_id)).toBe(false);
        expect(r.seats_left).toBeGreaterThan(0);
        expect(r.match_score).toBeGreaterThanOrEqual(0);
        expect(r.match_score).toBeLessThanOrEqual(1);
      }
      expect(recs.rows.map((r) => r.group_id)).not.toContain(await groupId(c, "Query Optimizers")); // full
      const scores = recs.rows.map((r) => r.match_score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    });
  });

  test("study partners share at least one course", async () => {
    await inRolledBackTx(async (c) => {
      const rows = await c.query("SELECT shared_courses FROM fn_recommend_partners($1, 10)", [await studentId(c, "ananya.rao")]);
      expect(rows.rows.every((r) => r.shared_courses.length > 0)).toBe(true);
    });
  });
});

describe("stored procedures", () => {
  test("sp_join_group adds a member and rejects a duplicate (SM409)", async () => {
    await inRolledBackTx(async (c) => {
      const me = await studentId(c, "ananya.rao");
      const gid = await groupId(c, "Gradient Descenders");
      await c.query("CALL sp_join_group($1, $2)", [me, gid]);
      expect(await scalar(c, "SELECT role FROM GROUP_MEMBERSHIP WHERE group_id = $1 AND student_id = $2", [gid, me])).toBe("member");
      expect((await attempt(c, "CALL sp_join_group($1, $2)", [me, gid]))?.code).toBe("SM409");
      expect((await attempt(c, "CALL sp_join_group($1, 999999)", [me]))?.code).toBe("SM404");
    });
  });

  test("sp_merge_tags re-points documents and removes the old tag", async () => {
    await inRolledBackTx(async (c) => {
      const before = await scalar<number>(c, "SELECT COUNT(DISTINCT dt.doc_id)::INT FROM DOCUMENT_TAG dt JOIN TAG t USING (tag_id) WHERE t.tag_name IN ('bfs', 'graphs')");
      await c.query("CALL sp_merge_tags('bfs', 'graphs')");
      expect(await scalar<number>(c, "SELECT COUNT(*)::INT FROM TAG WHERE tag_name = 'bfs'")).toBe(0);
      expect(await scalar<number>(c, "SELECT COUNT(*)::INT FROM DOCUMENT_TAG dt JOIN TAG t USING (tag_id) WHERE t.tag_name = 'graphs'")).toBe(before);
      expect((await attempt(c, "CALL sp_merge_tags('graphs', 'graphs')"))?.code).toBe("SM409");
    });
  });
});

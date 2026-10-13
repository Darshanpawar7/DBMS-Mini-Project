-- ============================================================
-- ScholarMesh -- 03 -- Views and a materialized view
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS mv_course_engagement;
DROP VIEW IF EXISTS v_student_interest;
DROP VIEW IF EXISTS v_doc_centroid;
DROP VIEW IF EXISTS v_group_overview;
DROP VIEW IF EXISTS v_document_catalog;

-- ------------------------------------------------------------
-- v_document_catalog: one row per document with owner, course,
-- tags and popularity -- the base of every listing in the app.
-- ------------------------------------------------------------
CREATE VIEW v_document_catalog AS
SELECT d.doc_id,
       d.title,
       d.description,
       d.file_type,
       d.file_size_bytes,
       d.visibility,
       d.embedding_status,
       d.upload_date,
       d.updated_at,
       d.student_id                                   AS owner_id,
       s.full_name                                    AS owner_name,
       d.course_id,
       c.course_code,
       c.course_title,
       COALESCE(t.tags, ARRAY[]::VARCHAR[])           AS tags,
       COALESCE(b.bookmark_count, 0)::INT             AS bookmark_count,
       COALESCE(k.chunk_count, 0)::INT                AS chunk_count
FROM DOCUMENT d
JOIN STUDENT s       ON s.student_id = d.student_id
LEFT JOIN COURSE c   ON c.course_id  = d.course_id
LEFT JOIN LATERAL (
        SELECT array_agg(tg.tag_name ORDER BY tg.tag_name) AS tags
        FROM DOCUMENT_TAG dt JOIN TAG tg ON tg.tag_id = dt.tag_id
        WHERE dt.doc_id = d.doc_id) t ON TRUE
LEFT JOIN LATERAL (
        SELECT count(*) AS bookmark_count FROM BOOKMARK bk WHERE bk.doc_id = d.doc_id) b ON TRUE
LEFT JOIN LATERAL (
        SELECT count(*) AS chunk_count FROM DOC_CHUNK ch WHERE ch.doc_id = d.doc_id) k ON TRUE;

-- ------------------------------------------------------------
-- v_group_overview: group + course + live seat count
-- ------------------------------------------------------------
CREATE VIEW v_group_overview AS
SELECT g.group_id,
       g.group_name,
       g.description,
       g.max_members,
       g.created_at,
       g.created_by,
       g.course_id,
       c.course_code,
       c.course_title,
       COUNT(m.student_id)::INT                       AS member_count,
       (g.max_members - COUNT(m.student_id))::INT     AS seats_left
FROM STUDY_GROUP g
JOIN COURSE c                 ON c.course_id = g.course_id
LEFT JOIN GROUP_MEMBERSHIP m  ON m.group_id  = g.group_id
GROUP BY g.group_id, c.course_id;

-- ------------------------------------------------------------
-- v_doc_centroid: one vector per document = mean of its chunk vectors
-- (pgvector's AVG aggregate). Used for "similar documents" and profiles.
-- ------------------------------------------------------------
CREATE VIEW v_doc_centroid AS
SELECT doc_id, AVG(embedding) AS centroid, COUNT(*)::INT AS chunk_count
FROM DOC_CHUNK
WHERE embedding IS NOT NULL
GROUP BY doc_id;

-- ------------------------------------------------------------
-- v_student_interest: a student's "interest vector" = mean of the
-- documents they uploaded, the documents they bookmarked, and the
-- queries they searched in the last 120 days. This is what lets the
-- database match study partners by meaning, not just by course.
-- ------------------------------------------------------------
CREATE VIEW v_student_interest AS
WITH signals AS (
    SELECT d.student_id, c.centroid AS vec, 'upload' AS source
    FROM DOCUMENT d JOIN v_doc_centroid c ON c.doc_id = d.doc_id
    UNION ALL
    SELECT b.student_id, c.centroid, 'bookmark'
    FROM BOOKMARK b JOIN v_doc_centroid c ON c.doc_id = b.doc_id
    UNION ALL
    SELECT l.student_id, l.query_embedding, 'search'
    FROM SEARCH_LOG l
    WHERE l.query_embedding IS NOT NULL
      AND l.searched_at > CURRENT_TIMESTAMP - INTERVAL '120 days'
)
SELECT student_id,
       AVG(vec)                                        AS interest_vec,
       COUNT(*)::INT                                   AS signal_count,
       COUNT(*) FILTER (WHERE source = 'upload')::INT   AS upload_signals,
       COUNT(*) FILTER (WHERE source = 'bookmark')::INT AS bookmark_signals,
       COUNT(*) FILTER (WHERE source = 'search')::INT   AS search_signals
FROM signals
GROUP BY student_id;

-- ------------------------------------------------------------
-- mv_course_engagement (MATERIALIZED): heavy per-course analytics for the
-- admin dashboard. Stored, so the dashboard does not re-aggregate every
-- table on each page load; refreshed on demand via fn_refresh_course_stats().
-- ------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_course_engagement AS
SELECT c.course_id,
       c.course_code,
       c.course_title,
       (SELECT COUNT(DISTINCT e.student_id) FROM ENROLLMENT e WHERE e.course_id = c.course_id)::INT AS enrolled_students,
       (SELECT COUNT(*) FROM DOCUMENT d WHERE d.course_id = c.course_id)::INT                       AS documents,
       (SELECT COUNT(*) FROM BOOKMARK b JOIN DOCUMENT d ON d.doc_id = b.doc_id
         WHERE d.course_id = c.course_id)::INT                                                     AS bookmarks,
       (SELECT COUNT(*) FROM STUDY_GROUP g WHERE g.course_id = c.course_id)::INT                   AS study_groups,
       (SELECT COUNT(*) FROM GROUP_MEMBERSHIP m JOIN STUDY_GROUP g ON g.group_id = m.group_id
         WHERE g.course_id = c.course_id)::INT                                                     AS group_members,
       CURRENT_TIMESTAMP                                                                           AS refreshed_at
FROM COURSE c
WITH DATA;

-- a UNIQUE index is required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX uq_mv_course_engagement ON mv_course_engagement(course_id);

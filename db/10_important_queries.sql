-- ============================================================
-- ScholarMesh -- 10 -- Important queries (demonstration script)
-- Not part of `npm run db:setup`. Run after the seed + embeddings:
--   docker exec -i scholarmesh-db psql -U postgres -d scholarmesh < db/10_important_queries.sql
-- Every data change below happens inside BEGIN ... ROLLBACK, so the
-- script can be run any number of times without changing the data.
-- ============================================================
\pset pager off
\pset border 2
\set ananya '(SELECT student_id FROM STUDENT WHERE email = ''ananya.rao@scholarmesh.test'')'

\echo '\n=== Q1  JOIN (4 tables) + ORDER BY: the 5 most-saved public notes with owner and course'
SELECT d.title, s.full_name AS owner, c.course_code, COUNT(b.student_id) AS saves
FROM DOCUMENT d
JOIN STUDENT s       ON s.student_id = d.student_id
LEFT JOIN COURSE c   ON c.course_id  = d.course_id
LEFT JOIN BOOKMARK b ON b.doc_id     = d.doc_id
WHERE d.visibility = 'public'
GROUP BY d.doc_id, s.full_name, c.course_code
ORDER BY saves DESC, d.title
LIMIT 5;

\echo '\n=== Q2  GROUP BY + HAVING + aggregates: courses with at least 3 notes'
SELECT c.course_code, COUNT(d.doc_id) AS notes, ROUND(AVG(d.file_size_bytes)) AS avg_bytes,
       MIN(d.upload_date)::DATE AS first_upload, MAX(d.upload_date)::DATE AS last_upload
FROM COURSE c
JOIN DOCUMENT d ON d.course_id = c.course_id
GROUP BY c.course_code
HAVING COUNT(d.doc_id) >= 3
ORDER BY notes DESC;

\echo '\n=== Q3  Subquery (IN): students who have bookmarked a note from a course they are NOT enrolled in'
SELECT DISTINCT s.full_name
FROM STUDENT s
JOIN BOOKMARK b ON b.student_id = s.student_id
JOIN DOCUMENT d ON d.doc_id = b.doc_id
WHERE d.course_id NOT IN (SELECT e.course_id FROM ENROLLMENT e WHERE e.student_id = s.student_id)
ORDER BY s.full_name;

\echo '\n=== Q4  Correlated subquery (NOT EXISTS): enrolled students who belong to no study group of that course'
SELECT c.course_code, COUNT(*) AS students_without_group
FROM ENROLLMENT e
JOIN COURSE c ON c.course_id = e.course_id
WHERE NOT EXISTS (SELECT 1
                  FROM GROUP_MEMBERSHIP m JOIN STUDY_GROUP g ON g.group_id = m.group_id
                  WHERE m.student_id = e.student_id AND g.course_id = e.course_id)
GROUP BY c.course_code
ORDER BY students_without_group DESC;

\echo '\n=== Q5  Scalar subquery in SELECT + CTE: each student vs the class average upload count'
WITH uploads AS (
    SELECT s.student_id, s.full_name, COUNT(d.doc_id) AS notes
    FROM STUDENT s LEFT JOIN DOCUMENT d ON d.student_id = s.student_id
    WHERE s.role = 'student'
    GROUP BY s.student_id
)
SELECT full_name, notes, ROUND((SELECT AVG(notes) FROM uploads), 2) AS class_avg
FROM uploads
WHERE notes > (SELECT AVG(notes) FROM uploads)
ORDER BY notes DESC;

\echo '\n=== Q6  Window functions: rank notes inside each course by saves (RANK, PARTITION BY)'
SELECT course_code, title, saves, course_rank
FROM (
    SELECT c.course_code, d.title, COUNT(b.student_id) AS saves,
           RANK() OVER (PARTITION BY c.course_code ORDER BY COUNT(b.student_id) DESC) AS course_rank
    FROM DOCUMENT d
    JOIN COURSE c ON c.course_id = d.course_id
    LEFT JOIN BOOKMARK b ON b.doc_id = d.doc_id
    GROUP BY c.course_code, d.doc_id
) ranked
WHERE course_rank = 1
ORDER BY saves DESC;

\echo '\n=== Q7  Window function: running total of searches per day (SUM OVER)'
SELECT searched_at::DATE AS day, COUNT(*) AS searches,
       SUM(COUNT(*)) OVER (ORDER BY searched_at::DATE) AS running_total
FROM SEARCH_LOG
GROUP BY searched_at::DATE
ORDER BY day DESC
LIMIT 7;

\echo '\n=== Q8  Views: catalog view + group overview view'
SELECT title, owner_name, course_code, tags, bookmark_count, chunk_count
FROM v_document_catalog ORDER BY bookmark_count DESC LIMIT 5;
SELECT group_name, course_code, member_count, max_members, seats_left FROM v_group_overview ORDER BY seats_left;

\echo '\n=== Q9  Materialized view (refresh through the SECURITY DEFINER function)'
SELECT fn_refresh_course_stats() AS refreshed_at;
SELECT course_code, enrolled_students, documents, bookmarks, study_groups, group_members FROM mv_course_engagement ORDER BY documents DESC;

\echo '\n=== Q10 Full-text search: GIN index, websearch syntax, ranking and highlighted snippet'
SELECT d.title, ROUND(k.rank::NUMERIC, 3) AS rank, k.snippet
FROM fn_keyword_search(:ananya, 'deadlock OR "page fault"', 5) k
JOIN DOCUMENT d USING (doc_id);

\echo '\n=== Q11 Vector similarity search: nearest passages to a logged question (cosine distance <=>)'
SELECT d.title, ROUND(s.similarity::NUMERIC, 3) AS similarity, LEFT(s.snippet, 70) AS best_passage
FROM fn_semantic_search(:ananya,
        (SELECT query_embedding FROM SEARCH_LOG WHERE query_text = 'how do models focus on the important words' LIMIT 1), 5) s
JOIN DOCUMENT d USING (doc_id);

\echo '\n=== Q12 Hybrid search: Reciprocal Rank Fusion of the two rankings'
SELECT d.title, h.keyword_rank, h.semantic_rank, ROUND(h.score::NUMERIC, 4) AS rrf_score
FROM fn_hybrid_search(:ananya, 'gradient',
        (SELECT query_embedding FROM SEARCH_LOG WHERE query_text = 'why do gradients vanish in deep networks' LIMIT 1), 6) h
JOIN DOCUMENT d USING (doc_id);

\echo '\n=== Q13 Study-group matching and study partners for Ananya'
SELECT group_name, course_code, seats_left, ROUND(similarity::NUMERIC, 3) AS similarity, shared_tags, ROUND(match_score::NUMERIC, 3) AS match_score
FROM fn_recommend_groups(:ananya, 5);
SELECT full_name, shared_courses, ROUND(similarity::NUMERIC, 3) AS similarity FROM fn_recommend_partners(:ananya, 5);

\echo '\n=== Q14 DML inside a transaction: INSERT, UPDATE, DELETE, INSERT ... SELECT, then ROLLBACK'
BEGIN;
INSERT INTO TAG (tag_name) VALUES ('  Write Ahead Logging ') RETURNING tag_id, tag_name;   -- trigger normalises the name
UPDATE DOCUMENT SET visibility = 'public' WHERE file_path = 'seed/er-model-mapping.md' RETURNING title, visibility;
INSERT INTO DOCUMENT_TAG (doc_id, tag_id)
    SELECT d.doc_id, t.tag_id FROM DOCUMENT d, TAG t
    WHERE d.file_path = 'seed/acid-isolation-levels.md' AND t.tag_name = 'write-ahead-logging'
    RETURNING doc_id, tag_id;
DELETE FROM BOOKMARK WHERE student_id = :ananya RETURNING doc_id;
SELECT COUNT(*) AS ananya_bookmarks_inside_tx FROM BOOKMARK WHERE student_id = :ananya;
ROLLBACK;
SELECT COUNT(*) AS ananya_bookmarks_after_rollback FROM BOOKMARK WHERE student_id = :ananya;

\echo '\n=== Q15 Stored procedure + triggers: a valid join succeeds, joining a full group fails (SM001)'
-- CALL arguments cannot be sub-queries, so look the ids up first (\gset stores them in psql variables)
SELECT student_id AS me         FROM STUDENT     WHERE email = 'ananya.rao@scholarmesh.test' \gset
SELECT student_id AS tanvi      FROM STUDENT     WHERE email = 'tanvi.hegde@scholarmesh.test' \gset
SELECT group_id   AS open_group FROM STUDY_GROUP WHERE group_name = 'Gradient Descenders' \gset
SELECT group_id   AS full_group FROM STUDY_GROUP WHERE group_name = 'Query Optimizers' \gset
BEGIN;
CALL sp_join_group(:me, :open_group);
SELECT group_name, member_count, seats_left FROM v_group_overview WHERE group_id = :open_group;
SAVEPOINT before_full;
CALL sp_join_group(:tanvi, :full_group);   -- expected: ERROR  This study group is full (4 of 4 seats taken)
ROLLBACK TO SAVEPOINT before_full;
ROLLBACK;

\echo '\n=== Q16 Indexes at work (EXPLAIN ANALYZE)'
\echo '--- B-tree on GROUP_MEMBERSHIP(student_id): "which groups is this student in?" (Phase 1 had no index here)'
SET enable_seqscan = off;   -- the tables are tiny, so ask the planner to show the index path it would use at scale
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT group_id FROM GROUP_MEMBERSHIP WHERE student_id = 5;
\echo '--- GIN on DOCUMENT.search_tsv: full-text match'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT doc_id FROM DOCUMENT WHERE search_tsv @@ websearch_to_tsquery('english', 'deadlock');
\echo '--- HNSW on DOC_CHUNK.embedding: approximate nearest neighbours'
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT chunk_id FROM DOC_CHUNK
ORDER BY embedding <=> (SELECT embedding FROM DOC_CHUNK ORDER BY chunk_id LIMIT 1)
LIMIT 5;
RESET enable_seqscan;

\echo '\n=== Q17 Index catalogue (pg_indexes)'
SELECT tablename, indexname, regexp_replace(indexdef, '^.* USING ', '') AS definition
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

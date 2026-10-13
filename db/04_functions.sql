-- ============================================================
-- ScholarMesh -- 04 -- Stored functions and procedures
-- Custom SQLSTATE codes raised here and in 05 (mapped to HTTP errors by the API):
--   SM001 group full          SM002 not enrolled in the group's course
--   SM003 last group admin    SM004 capacity below current members
--   SM404 not found           SM409 already exists
-- ============================================================

-- ------------------------------------------------------------
-- ACCESS CONTROL: the single definition of "who may see which document".
-- Every search and listing goes through this, so a private note can never
-- leak through any query path.
--   public  -> everyone
--   course  -> students enrolled in the document's course
--   private -> the owner only
--   admins  -> everything (moderation)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_visible_doc_ids(p_student INT)
RETURNS TABLE (doc_id INT)
LANGUAGE sql STABLE AS $$
    SELECT d.doc_id
    FROM DOCUMENT d
    WHERE d.visibility = 'public'
       OR d.student_id = p_student
       OR (d.visibility = 'course' AND EXISTS (
               SELECT 1 FROM ENROLLMENT e
               WHERE e.student_id = p_student AND e.course_id = d.course_id))
       OR EXISTS (SELECT 1 FROM STUDENT s WHERE s.student_id = p_student AND s.role = 'admin')
$$;

CREATE OR REPLACE FUNCTION fn_can_view_document(p_student INT, p_doc INT)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM fn_visible_doc_ids(p_student) v WHERE v.doc_id = p_doc)
$$;

-- Visible documents narrowed by the optional search filters
CREATE OR REPLACE FUNCTION fn_search_scope(p_student INT, p_course INT DEFAULT NULL, p_tag TEXT DEFAULT NULL)
RETURNS TABLE (doc_id INT)
LANGUAGE sql STABLE AS $$
    SELECT v.doc_id
    FROM fn_visible_doc_ids(p_student) v
    JOIN DOCUMENT d ON d.doc_id = v.doc_id
    WHERE (p_course IS NULL OR d.course_id = p_course)
      AND (p_tag IS NULL OR EXISTS (
              SELECT 1 FROM DOCUMENT_TAG dt JOIN TAG t ON t.tag_id = dt.tag_id
              WHERE dt.doc_id = d.doc_id AND t.tag_name = p_tag))
$$;

-- ------------------------------------------------------------
-- CHUNKING: split text into passages of at most p_max_chars.
-- Paragraphs are kept together where possible; an oversized paragraph is
-- split on sentence boundaries; small pieces are packed together.
-- Called by the DOCUMENT trigger in 05.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_chunk_text(p_text TEXT, p_max_chars INT DEFAULT 800)
RETURNS TABLE (chunk_index INT, chunk_text TEXT)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_piece  TEXT;
    v_buffer TEXT := '';
    v_idx    INT  := 0;
BEGIN
    IF p_text IS NULL OR btrim(p_text) = '' THEN
        RETURN;
    END IF;

    FOR v_piece IN
        SELECT regexp_replace(btrim(s.piece), '\s+', ' ', 'g')
        FROM regexp_split_to_table(p_text, '\n\s*\n') WITH ORDINALITY AS p(para, pn)
        CROSS JOIN LATERAL unnest(
                CASE WHEN length(p.para) <= p_max_chars THEN ARRAY[p.para]
                     ELSE regexp_split_to_array(p.para, '(?<=[.!?])\s+') END
             ) WITH ORDINALITY AS s(piece, sn)
        WHERE btrim(s.piece) <> ''
        ORDER BY p.pn, s.sn
    LOOP
        -- flush the buffer when the next piece would overflow it
        IF v_buffer <> '' AND length(v_buffer) + 1 + length(v_piece) > p_max_chars THEN
            chunk_index := v_idx; chunk_text := v_buffer; RETURN NEXT;
            v_idx := v_idx + 1;
            v_buffer := '';
        END IF;
        v_buffer := CASE WHEN v_buffer = '' THEN v_piece ELSE v_buffer || ' ' || v_piece END;
        -- a single sentence longer than the limit is hard-cut
        WHILE length(v_buffer) > p_max_chars LOOP
            chunk_index := v_idx; chunk_text := left(v_buffer, p_max_chars); RETURN NEXT;
            v_idx := v_idx + 1;
            v_buffer := substr(v_buffer, p_max_chars + 1);
        END LOOP;
    END LOOP;

    IF v_buffer <> '' THEN
        chunk_index := v_idx; chunk_text := v_buffer; RETURN NEXT;
    END IF;
END $$;

-- ------------------------------------------------------------
-- SEARCH 1 -- keyword (full-text): GIN index + websearch syntax + ranking.
-- Highlights use the markers ⟦ ⟧ (not HTML) so the UI can render them
-- safely without injecting user text as HTML.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_keyword_search(p_student INT, p_query TEXT, p_limit INT DEFAULT 10,
                                             p_course INT DEFAULT NULL, p_tag TEXT DEFAULT NULL)
RETURNS TABLE (doc_id INT, rank REAL, snippet TEXT)
LANGUAGE sql STABLE AS $$
    SELECT d.doc_id,
           ts_rank_cd(d.search_tsv, q, 32)::REAL AS rank,
           ts_headline('english', coalesce(d.content, d.description, d.title), q,
                       'StartSel=⟦, StopSel=⟧, MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "')
    FROM DOCUMENT d
    JOIN fn_search_scope(p_student, p_course, p_tag) v ON v.doc_id = d.doc_id
    CROSS JOIN websearch_to_tsquery('english', p_query) AS q
    WHERE d.search_tsv @@ q
    ORDER BY rank DESC, d.upload_date DESC
    LIMIT p_limit
$$;

-- ------------------------------------------------------------
-- SEARCH 2 -- semantic (vector): nearest chunks by cosine distance (<=>),
-- served by the HNSW index, then the best chunk per document.
-- similarity = 1 - cosine distance (1 = same meaning, 0 = unrelated).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_semantic_search(p_student INT, p_query_vec vector, p_limit INT DEFAULT 10,
                                              p_min_similarity REAL DEFAULT 0.28,
                                              p_course INT DEFAULT NULL, p_tag TEXT DEFAULT NULL)
RETURNS TABLE (doc_id INT, similarity REAL, snippet TEXT, chunk_index INT)
LANGUAGE sql STABLE AS $$
    WITH nearest_chunks AS (
        SELECT c.doc_id, c.chunk_index, c.chunk_text, (c.embedding <=> p_query_vec) AS distance
        FROM DOC_CHUNK c
        JOIN fn_search_scope(p_student, p_course, p_tag) v ON v.doc_id = c.doc_id
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> p_query_vec
        LIMIT p_limit * 8
    ), best_per_doc AS (
        SELECT DISTINCT ON (n.doc_id) n.doc_id, n.chunk_index, n.chunk_text, n.distance
        FROM nearest_chunks n
        ORDER BY n.doc_id, n.distance
    )
    SELECT b.doc_id, (1 - b.distance)::REAL, b.chunk_text, b.chunk_index
    FROM best_per_doc b
    WHERE 1 - b.distance >= p_min_similarity
    ORDER BY b.distance
    LIMIT p_limit
$$;

-- ------------------------------------------------------------
-- SEARCH 3 -- hybrid: Reciprocal Rank Fusion of keyword + semantic ranks.
-- score = 1/(60 + keyword_rank) + 1/(60 + semantic_rank)
-- Exact-term matches and meaning matches both lift a document.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_hybrid_search(p_student INT, p_query TEXT, p_query_vec vector, p_limit INT DEFAULT 10,
                                            p_course INT DEFAULT NULL, p_tag TEXT DEFAULT NULL)
RETURNS TABLE (doc_id INT, score REAL, keyword_rank INT, semantic_rank INT, similarity REAL, snippet TEXT)
LANGUAGE sql STABLE AS $$
    WITH kw AS (
        SELECT k.doc_id, k.snippet, ROW_NUMBER() OVER (ORDER BY k.rank DESC) AS rnk
        FROM fn_keyword_search(p_student, p_query, 40, p_course, p_tag) k
    ), sem AS (
        SELECT s.doc_id, s.snippet, s.similarity, ROW_NUMBER() OVER (ORDER BY s.similarity DESC) AS rnk
        FROM fn_semantic_search(p_student, p_query_vec, 40, 0.28, p_course, p_tag) s
    )
    SELECT COALESCE(kw.doc_id, sem.doc_id),
           (COALESCE(1.0 / (60 + kw.rnk), 0) + COALESCE(1.0 / (60 + sem.rnk), 0))::REAL AS score,
           kw.rnk::INT,
           sem.rnk::INT,
           sem.similarity,
           COALESCE(kw.snippet, sem.snippet)
    FROM kw
    FULL OUTER JOIN sem ON sem.doc_id = kw.doc_id
    ORDER BY score DESC
    LIMIT p_limit
$$;

-- ------------------------------------------------------------
-- "More like this": nearest document centroids the student may see
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_similar_documents(p_student INT, p_doc INT, p_limit INT DEFAULT 5)
RETURNS TABLE (doc_id INT, similarity REAL)
LANGUAGE sql STABLE AS $$
    SELECT c.doc_id, (1 - (c.centroid <=> src.centroid))::REAL
    FROM v_doc_centroid src
    JOIN v_doc_centroid c ON c.doc_id <> src.doc_id
    JOIN fn_visible_doc_ids(p_student) v ON v.doc_id = c.doc_id
    WHERE src.doc_id = p_doc
    ORDER BY c.centroid <=> src.centroid
    LIMIT p_limit
$$;

-- ------------------------------------------------------------
-- STUDY-GROUP MATCHING
-- Candidate groups: in a course the student is enrolled in, with a free
-- seat, that the student has not joined. Ranked by
--   match_score = 0.7 * cosine(student interest, group interest)
--               + 0.3 * Jaccard(student's topics, group's topics)
-- Group interest = mean of its members' interest vectors.
-- "Topics" = tags of the non-private documents someone uploaded or
-- bookmarked *within the group's course*, so shared topics are
-- course-relevant and never reveal what is in someone's private notes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recommend_groups(p_student INT, p_limit INT DEFAULT 5)
RETURNS TABLE (group_id INT, group_name VARCHAR, course_code VARCHAR, member_count INT, seats_left INT,
               similarity REAL, shared_tags VARCHAR[], match_score REAL)
LANGUAGE sql STABLE AS $$
    WITH me AS (
        SELECT interest_vec FROM v_student_interest WHERE student_id = p_student
    ), topics AS (                        -- (student, course, tag) from uploads and bookmarks
        SELECT DISTINCT a.student_id, d.course_id, t.tag_name
        FROM (SELECT student_id, doc_id FROM DOCUMENT
              UNION
              SELECT student_id, doc_id FROM BOOKMARK) a
        JOIN DOCUMENT d      ON d.doc_id = a.doc_id AND d.course_id IS NOT NULL AND d.visibility <> 'private'
        JOIN DOCUMENT_TAG dt ON dt.doc_id = d.doc_id
        JOIN TAG t           ON t.tag_id = dt.tag_id
    ), candidates AS (
        SELECT g.*
        FROM v_group_overview g
        WHERE g.seats_left > 0
          AND g.course_id IN (SELECT e.course_id FROM ENROLLMENT e WHERE e.student_id = p_student)
          AND NOT EXISTS (SELECT 1 FROM GROUP_MEMBERSHIP m
                          WHERE m.group_id = g.group_id AND m.student_id = p_student)
    ), group_vec AS (
        SELECT m.group_id, AVG(si.interest_vec) AS vec
        FROM GROUP_MEMBERSHIP m
        JOIN v_student_interest si ON si.student_id = m.student_id
        WHERE m.group_id IN (SELECT c.group_id FROM candidates c)
        GROUP BY m.group_id
    ), group_topics AS (
        SELECT DISTINCT c.group_id, tp.tag_name
        FROM candidates c
        JOIN GROUP_MEMBERSHIP m ON m.group_id = c.group_id
        JOIN topics tp ON tp.student_id = m.student_id AND tp.course_id = c.course_id
    ), my_topics AS (
        SELECT DISTINCT c.group_id, tp.tag_name
        FROM candidates c
        JOIN topics tp ON tp.student_id = p_student AND tp.course_id = c.course_id
    ), overlap AS (                       -- Jaccard = |A ∩ B| / |A ∪ B|
        SELECT COALESCE(gt.group_id, mt.group_id) AS group_id,
               array_agg(gt.tag_name ORDER BY gt.tag_name)
                   FILTER (WHERE gt.tag_name IS NOT NULL AND mt.tag_name IS NOT NULL) AS shared,
               COUNT(*) FILTER (WHERE gt.tag_name IS NOT NULL AND mt.tag_name IS NOT NULL)::REAL
                   / COUNT(*) AS jaccard
        FROM group_topics gt
        FULL OUTER JOIN my_topics mt ON mt.group_id = gt.group_id AND mt.tag_name = gt.tag_name
        GROUP BY COALESCE(gt.group_id, mt.group_id)
    )
    SELECT c.group_id, c.group_name, c.course_code, c.member_count, c.seats_left,
           sim.similarity,
           COALESCE(o.shared, ARRAY[]::VARCHAR[]),
           (0.7 * sim.similarity + 0.3 * COALESCE(o.jaccard, 0))::REAL AS match_score
    FROM candidates c
    LEFT JOIN group_vec gv ON gv.group_id = c.group_id
    LEFT JOIN overlap o    ON o.group_id = c.group_id
    LEFT JOIN me ON TRUE
    CROSS JOIN LATERAL (SELECT COALESCE(1 - (gv.vec <=> me.interest_vec), 0)::REAL AS similarity) sim
    ORDER BY match_score DESC, c.seats_left DESC
    LIMIT p_limit
$$;

-- Study partners: classmates (shared course) ranked by interest similarity
CREATE OR REPLACE FUNCTION fn_recommend_partners(p_student INT, p_limit INT DEFAULT 5)
RETURNS TABLE (student_id INT, full_name VARCHAR, program VARCHAR, shared_courses VARCHAR[], similarity REAL)
LANGUAGE sql STABLE AS $$
    WITH classmates AS (
        SELECT o.student_id, array_agg(DISTINCT c.course_code ORDER BY c.course_code) AS shared_courses
        FROM ENROLLMENT mine
        JOIN ENROLLMENT o ON o.course_id = mine.course_id AND o.student_id <> mine.student_id
        JOIN COURSE c ON c.course_id = mine.course_id
        WHERE mine.student_id = p_student
        GROUP BY o.student_id
    )
    SELECT s.student_id, s.full_name, s.program, cm.shared_courses,
           COALESCE(1 - (them.interest_vec <=> me.interest_vec), 0)::REAL AS similarity
    FROM classmates cm
    JOIN STUDENT s ON s.student_id = cm.student_id AND s.is_active AND s.role = 'student'
    LEFT JOIN v_student_interest them ON them.student_id = cm.student_id
    LEFT JOIN v_student_interest me   ON me.student_id = p_student
    ORDER BY similarity DESC, cardinality(cm.shared_courses) DESC
    LIMIT p_limit
$$;

-- ------------------------------------------------------------
-- PROCEDURE: join a study group (transaction-safe).
-- SELECT ... FOR UPDATE locks the group row, so two students racing for
-- the last seat are serialised: one gets it, the other gets SM001.
-- Capacity and enrollment rules are enforced by trg_membership_check (05).
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_join_group(p_student INT, p_group INT)
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM STUDY_GROUP WHERE group_id = p_group FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Study group % does not exist', p_group USING ERRCODE = 'SM404';
    END IF;
    IF EXISTS (SELECT 1 FROM GROUP_MEMBERSHIP WHERE group_id = p_group AND student_id = p_student) THEN
        RAISE EXCEPTION 'You are already a member of this group' USING ERRCODE = 'SM409';
    END IF;
    INSERT INTO GROUP_MEMBERSHIP (group_id, student_id, role) VALUES (p_group, p_student, 'member');
END $$;

-- ------------------------------------------------------------
-- PROCEDURE: merge one tag into another (admin clean-up), all-or-nothing.
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_merge_tags(p_from VARCHAR, p_into VARCHAR)
LANGUAGE plpgsql AS $$
DECLARE
    v_from INT;
    v_into INT;
BEGIN
    SELECT tag_id INTO v_from FROM TAG WHERE tag_name = lower(btrim(p_from));
    SELECT tag_id INTO v_into FROM TAG WHERE tag_name = lower(btrim(p_into));
    IF v_from IS NULL OR v_into IS NULL THEN
        RAISE EXCEPTION 'Both tags must exist (% -> %)', p_from, p_into USING ERRCODE = 'SM404';
    END IF;
    IF v_from = v_into THEN
        RAISE EXCEPTION 'Cannot merge a tag into itself' USING ERRCODE = 'SM409';
    END IF;
    INSERT INTO DOCUMENT_TAG (doc_id, tag_id)
        SELECT doc_id, v_into FROM DOCUMENT_TAG WHERE tag_id = v_from
        ON CONFLICT DO NOTHING;
    DELETE FROM TAG WHERE tag_id = v_from;     -- its DOCUMENT_TAG rows go with it (CASCADE)
END $$;

-- ------------------------------------------------------------
-- Dashboard statistics for one student (aggregates in one round trip)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_student_stats(p_student INT)
RETURNS TABLE (my_documents INT, my_bookmarks INT, my_groups INT, my_courses INT, searches_30d INT, bookmarks_received INT)
LANGUAGE sql STABLE AS $$
    SELECT
        (SELECT COUNT(*) FROM DOCUMENT WHERE student_id = p_student)::INT,
        (SELECT COUNT(*) FROM BOOKMARK WHERE student_id = p_student)::INT,
        (SELECT COUNT(*) FROM GROUP_MEMBERSHIP WHERE student_id = p_student)::INT,
        (SELECT COUNT(DISTINCT course_id) FROM ENROLLMENT WHERE student_id = p_student)::INT,
        (SELECT COUNT(*) FROM SEARCH_LOG WHERE student_id = p_student
            AND searched_at > CURRENT_TIMESTAMP - INTERVAL '30 days')::INT,
        (SELECT COUNT(*) FROM BOOKMARK b JOIN DOCUMENT d ON d.doc_id = b.doc_id
            WHERE d.student_id = p_student AND b.student_id <> p_student)::INT
$$;

-- ------------------------------------------------------------
-- Refresh the analytics materialized view. SECURITY DEFINER runs it with
-- the owner's rights, so the low-privilege app role can trigger a refresh
-- without owning (or being able to drop) the view.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_refresh_course_stats()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_course_engagement;
    RETURN CURRENT_TIMESTAMP;
END $$;

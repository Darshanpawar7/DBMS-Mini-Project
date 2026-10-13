-- ============================================================
-- ScholarMesh -- 05 -- Triggers (business rules enforced inside the database)
-- ============================================================

-- ------------------------------------------------------------
-- T1. Normalise STUDENT input (trim name, lower-case email)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_student_normalize() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.full_name := regexp_replace(btrim(NEW.full_name), '\s+', ' ', 'g');
    NEW.email     := lower(btrim(NEW.email));
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_student_normalize ON STUDENT;
CREATE TRIGGER trg_student_normalize
    BEFORE INSERT OR UPDATE OF full_name, email ON STUDENT
    FOR EACH ROW EXECUTE FUNCTION fn_student_normalize();

-- ------------------------------------------------------------
-- T2. Normalise TAG names: "Machine Learning " -> "machine-learning"
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tag_normalize() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.tag_name := lower(regexp_replace(btrim(NEW.tag_name), '\s+', '-', 'g'));
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tag_normalize ON TAG;
CREATE TRIGGER trg_tag_normalize
    BEFORE INSERT OR UPDATE OF tag_name ON TAG
    FOR EACH ROW EXECUTE FUNCTION fn_tag_normalize();

-- ------------------------------------------------------------
-- T3. DOCUMENT housekeeping (BEFORE INSERT/UPDATE)
--   * stamp updated_at when the note itself is edited (not for
--     bookkeeping such as embedding_status), unless set explicitly
--   * a document whose course is deleted (FK SET NULL) drops from
--     'course' to 'private' visibility instead of violating the CHECK
--   * new or changed text means the embeddings are stale -> 'pending'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_document_before_write() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
           AND (NEW.title, NEW.description, NEW.visibility, NEW.course_id, NEW.content)
               IS DISTINCT FROM (OLD.title, OLD.description, OLD.visibility, OLD.course_id, OLD.content) THEN
            NEW.updated_at := CURRENT_TIMESTAMP;
        END IF;
        IF NEW.course_id IS NULL AND OLD.course_id IS NOT NULL AND NEW.visibility = 'course' THEN
            NEW.visibility := 'private';
        END IF;
    END IF;
    IF TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content THEN
        NEW.embedding_status := 'pending';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_document_before_write ON DOCUMENT;
CREATE TRIGGER trg_document_before_write
    BEFORE INSERT OR UPDATE ON DOCUMENT
    FOR EACH ROW EXECUTE FUNCTION fn_document_before_write();

-- ------------------------------------------------------------
-- T4. Keep DOC_CHUNK in sync with DOCUMENT.content (AFTER INSERT/UPDATE).
--     The chunks are re-created with NULL embeddings; the embedding worker
--     in the app fills them and marks the document 'ready'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_document_rechunk() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
        RETURN NULL;
    END IF;
    DELETE FROM DOC_CHUNK WHERE doc_id = NEW.doc_id;
    INSERT INTO DOC_CHUNK (doc_id, chunk_index, chunk_text)
        SELECT NEW.doc_id, ch.chunk_index, ch.chunk_text
        FROM fn_chunk_text(NEW.content) AS ch;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_document_rechunk ON DOCUMENT;
CREATE TRIGGER trg_document_rechunk
    AFTER INSERT OR UPDATE OF content ON DOCUMENT
    FOR EACH ROW EXECUTE FUNCTION fn_document_rechunk();

-- ------------------------------------------------------------
-- T5. GROUP_MEMBERSHIP admission rules (BEFORE INSERT)
--   * the group row is locked FOR UPDATE -> concurrent joins are serialised,
--     so max_members can never be exceeded, even under a race
--   * the student must be enrolled in the group's course
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_membership_check() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_max    SMALLINT;
    v_course INT;
    v_count  INT;
BEGIN
    SELECT max_members, course_id INTO v_max, v_course
    FROM STUDY_GROUP WHERE group_id = NEW.group_id
    FOR UPDATE;

    SELECT COUNT(*) INTO v_count FROM GROUP_MEMBERSHIP WHERE group_id = NEW.group_id;
    IF v_count >= v_max THEN
        RAISE EXCEPTION 'This study group is full (% of % seats taken)', v_count, v_max
              USING ERRCODE = 'SM001';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM ENROLLMENT
                   WHERE student_id = NEW.student_id AND course_id = v_course) THEN
        RAISE EXCEPTION 'Only students enrolled in this course can create or join its study groups'
              USING ERRCODE = 'SM002';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_membership_check ON GROUP_MEMBERSHIP;
CREATE TRIGGER trg_membership_check
    BEFORE INSERT ON GROUP_MEMBERSHIP
    FOR EACH ROW EXECUTE FUNCTION fn_membership_check();

-- ------------------------------------------------------------
-- T6. The creator of a group automatically becomes its admin (AFTER INSERT).
--     Because this goes through T5, a student can only create a group for a
--     course they are enrolled in.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_group_add_creator() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO GROUP_MEMBERSHIP (group_id, student_id, role, joined_at)
        VALUES (NEW.group_id, NEW.created_by, 'admin', NEW.created_at);
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_group_add_creator ON STUDY_GROUP;
CREATE TRIGGER trg_group_add_creator
    AFTER INSERT ON STUDY_GROUP
    FOR EACH ROW EXECUTE FUNCTION fn_group_add_creator();

-- ------------------------------------------------------------
-- T7. Admin succession (AFTER DELETE on GROUP_MEMBERSHIP).
--     When the last admin leaves (or their account is deleted), the
--     longest-standing member is promoted; an empty group is removed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_group_admin_succession() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_next INT;
BEGIN
    -- the whole group is being deleted (cascade): nothing to do
    IF NOT EXISTS (SELECT 1 FROM STUDY_GROUP WHERE group_id = OLD.group_id) THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM GROUP_MEMBERSHIP WHERE group_id = OLD.group_id) THEN
        DELETE FROM STUDY_GROUP WHERE group_id = OLD.group_id;
    ELSIF NOT EXISTS (SELECT 1 FROM GROUP_MEMBERSHIP
                      WHERE group_id = OLD.group_id AND role = 'admin') THEN
        SELECT student_id INTO v_next
        FROM GROUP_MEMBERSHIP
        WHERE group_id = OLD.group_id
        ORDER BY joined_at, student_id
        LIMIT 1;
        UPDATE GROUP_MEMBERSHIP SET role = 'admin'
        WHERE group_id = OLD.group_id AND student_id = v_next;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_group_admin_succession ON GROUP_MEMBERSHIP;
CREATE TRIGGER trg_group_admin_succession
    AFTER DELETE ON GROUP_MEMBERSHIP
    FOR EACH ROW EXECUTE FUNCTION fn_group_admin_succession();

-- ------------------------------------------------------------
-- T8. A group may not be left without an admin by demotion (BEFORE UPDATE)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_group_last_admin_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.role = 'admin' AND NEW.role = 'member' AND NOT EXISTS (
           SELECT 1 FROM GROUP_MEMBERSHIP
           WHERE group_id = OLD.group_id AND role = 'admin' AND student_id <> OLD.student_id) THEN
        RAISE EXCEPTION 'A study group needs at least one admin -- promote someone else first'
              USING ERRCODE = 'SM003';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_group_last_admin_guard ON GROUP_MEMBERSHIP;
CREATE TRIGGER trg_group_last_admin_guard
    BEFORE UPDATE OF role ON GROUP_MEMBERSHIP
    FOR EACH ROW EXECUTE FUNCTION fn_group_last_admin_guard();

-- ------------------------------------------------------------
-- T9. max_members cannot be lowered below the current member count
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_group_capacity_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM GROUP_MEMBERSHIP WHERE group_id = NEW.group_id;
    IF NEW.max_members < v_count THEN
        RAISE EXCEPTION 'The group already has % members; max_members cannot be %', v_count, NEW.max_members
              USING ERRCODE = 'SM004';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_group_capacity_guard ON STUDY_GROUP;
CREATE TRIGGER trg_group_capacity_guard
    BEFORE UPDATE OF max_members ON STUDY_GROUP
    FOR EACH ROW EXECUTE FUNCTION fn_group_capacity_guard();

-- ------------------------------------------------------------
-- T10. Dropping a course also drops the student's groups in that course
--      (unless still enrolled in another semester of it).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_enrollment_cleanup() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ENROLLMENT
                   WHERE student_id = OLD.student_id AND course_id = OLD.course_id) THEN
        DELETE FROM GROUP_MEMBERSHIP m
        USING STUDY_GROUP g
        WHERE g.group_id = m.group_id
          AND g.course_id = OLD.course_id
          AND m.student_id = OLD.student_id;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_enrollment_cleanup ON ENROLLMENT;
CREATE TRIGGER trg_enrollment_cleanup
    AFTER DELETE ON ENROLLMENT
    FOR EACH ROW EXECUTE FUNCTION fn_enrollment_cleanup();

-- ------------------------------------------------------------
-- T11. Generic audit trail. The app sets the acting user per transaction:
--        SELECT set_config('app.current_user_id', '<id>', true);
--      Secrets and bulky columns are stripped from the stored JSON.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_row() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_actor INT := NULLIF(current_setting('app.current_user_id', true), '')::INT;
    v_old   JSONB;
    v_new   JSONB;
    v_pk    TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        v_old := to_jsonb(OLD) - 'password_hash' - 'content' - 'search_tsv';
    END IF;
    IF TG_OP <> 'DELETE' THEN
        v_new := to_jsonb(NEW) - 'password_hash' - 'content' - 'search_tsv';
    END IF;
    v_pk := COALESCE(v_new, v_old) ->> TG_ARGV[0];

    INSERT INTO AUDIT_LOG (table_name, action, row_pk, actor_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, v_pk,
            CASE WHEN EXISTS (SELECT 1 FROM STUDENT WHERE student_id = v_actor) THEN v_actor END,
            v_old, v_new);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_student ON STUDENT;
CREATE TRIGGER trg_audit_student
    AFTER UPDATE OF role, is_active OR DELETE ON STUDENT
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('student_id');

DROP TRIGGER IF EXISTS trg_audit_document ON DOCUMENT;
CREATE TRIGGER trg_audit_document
    AFTER INSERT OR UPDATE OF title, visibility, course_id OR DELETE ON DOCUMENT
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('doc_id');

DROP TRIGGER IF EXISTS trg_audit_course ON COURSE;
CREATE TRIGGER trg_audit_course
    AFTER INSERT OR UPDATE OR DELETE ON COURSE
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('course_id');

DROP TRIGGER IF EXISTS trg_audit_group ON STUDY_GROUP;
CREATE TRIGGER trg_audit_group
    AFTER INSERT OR DELETE ON STUDY_GROUP
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('group_id');

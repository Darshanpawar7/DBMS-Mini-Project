-- ============================================================
-- ScholarMesh -- 02 -- Phase 2 schema evolution (ALTER / CREATE / DROP)
-- Adds roles, document text + full-text search, the pgvector store,
-- audit logging, and database-level validation rules.
-- ============================================================

-- Vector paradigm: pgvector adds the VECTOR type, distance operators and HNSW
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- STUDENT: system role (minimum two roles) + account state
-- ------------------------------------------------------------
ALTER TABLE STUDENT
    ADD COLUMN role          VARCHAR(10) NOT NULL DEFAULT 'student',
    ADD COLUMN is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    ADD COLUMN last_login_at TIMESTAMPTZ;

ALTER TABLE STUDENT
    ADD CONSTRAINT chk_student_role        CHECK (role IN ('student','admin')),
    ADD CONSTRAINT chk_student_email       CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
    ADD CONSTRAINT chk_student_name        CHECK (length(btrim(full_name)) >= 2),
    -- the database itself refuses anything that is not a bcrypt hash,
    -- so a plain-text password can never be stored by mistake
    ADD CONSTRAINT chk_student_pwd_bcrypt  CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$');

-- ------------------------------------------------------------
-- COURSE: validation
-- ------------------------------------------------------------
ALTER TABLE COURSE
    ADD CONSTRAINT chk_course_code  CHECK (course_code ~ '^[A-Z0-9-]{3,20}$'),
    ADD CONSTRAINT chk_course_title CHECK (length(btrim(course_title)) >= 3);

-- ------------------------------------------------------------
-- DOCUMENT: extracted text, metadata, full-text vector
-- ------------------------------------------------------------
ALTER TABLE DOCUMENT
    ADD COLUMN description      VARCHAR(500),
    ADD COLUMN content          TEXT,
    ADD COLUMN file_size_bytes  INTEGER,
    ADD COLUMN embedding_status VARCHAR(10) NOT NULL DEFAULT 'pending',
    ADD COLUMN updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- weighted full-text vector, always in sync because it is GENERATED
    ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')),       'A')
       || setweight(to_tsvector('english', coalesce(description, '')), 'B')
       || setweight(to_tsvector('english', coalesce(content, '')),     'C')
    ) STORED;

-- Phase 1 kept a free-text pointer (vector_id) into an external vector store.
-- Nothing stopped it from dangling, and one vector per document is too coarse
-- for good retrieval. Embeddings now live in DOC_CHUNK with a real foreign key.
ALTER TABLE DOCUMENT DROP COLUMN vector_id;

ALTER TABLE DOCUMENT
    ADD CONSTRAINT chk_document_title      CHECK (length(btrim(title)) >= 3),
    ADD CONSTRAINT chk_document_file_type  CHECK (file_type IN ('pdf','txt','md')),
    ADD CONSTRAINT chk_document_file_size  CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 1 AND 10485760),
    ADD CONSTRAINT chk_document_embedding  CHECK (embedding_status IN ('pending','ready','failed')),
    -- "course" visibility only makes sense when the document belongs to a course
    ADD CONSTRAINT chk_document_course_vis CHECK (visibility <> 'course' OR course_id IS NOT NULL);

-- ------------------------------------------------------------
-- TAG / ENROLLMENT / STUDY_GROUP / SEARCH_LOG: validation + new columns
-- ------------------------------------------------------------
ALTER TABLE TAG
    ADD CONSTRAINT chk_tag_name CHECK (tag_name ~ '^[a-z0-9][a-z0-9+#.-]{0,49}$');

ALTER TABLE ENROLLMENT
    ADD CONSTRAINT chk_enrollment_semester CHECK (semester ~ '^[0-9]{4}-(ODD|EVEN)$');

ALTER TABLE STUDY_GROUP
    ADD COLUMN description VARCHAR(300),
    ADD CONSTRAINT chk_group_name        CHECK (length(btrim(group_name)) >= 3),
    ADD CONSTRAINT chk_group_max_members CHECK (max_members BETWEEN 2 AND 20);
ALTER TABLE STUDY_GROUP DROP CONSTRAINT study_group_max_members_check;  -- superseded by the stricter rule above

ALTER TABLE SEARCH_LOG
    ADD COLUMN search_mode     VARCHAR(10) NOT NULL DEFAULT 'hybrid',
    ADD COLUMN result_count    INTEGER,
    ADD COLUMN query_embedding vector(384),
    ADD CONSTRAINT chk_search_mode  CHECK (search_mode IN ('keyword','semantic','hybrid')),
    ADD CONSTRAINT chk_search_query CHECK (length(btrim(query_text)) >= 2),
    ADD CONSTRAINT chk_search_count CHECK (result_count IS NULL OR result_count >= 0);

-- ------------------------------------------------------------
-- 11. DOC_CHUNK (weak entity of DOCUMENT; the vector store)
--     Each document is split into ~800-character chunks by a trigger (05);
--     each chunk carries a 384-d sentence embedding (all-MiniLM-L6-v2).
-- ------------------------------------------------------------
CREATE TABLE DOC_CHUNK (
    chunk_id     SERIAL PRIMARY KEY,
    doc_id       INTEGER NOT NULL REFERENCES DOCUMENT(doc_id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL CHECK (chunk_index >= 0),
    chunk_text   TEXT    NOT NULL CHECK (length(chunk_text) > 0),
    embedding    vector(384),            -- NULL until the embedding worker fills it
    embedded_at  TIMESTAMPTZ,
    CONSTRAINT uq_chunk_per_doc UNIQUE (doc_id, chunk_index),
    CONSTRAINT chk_chunk_embedded CHECK ((embedding IS NULL) = (embedded_at IS NULL))
);

-- ------------------------------------------------------------
-- 12. AUDIT_LOG (filled only by triggers; the app may read and insert, never edit)
-- ------------------------------------------------------------
CREATE TABLE AUDIT_LOG (
    audit_id    BIGSERIAL PRIMARY KEY,
    table_name  VARCHAR(40) NOT NULL,
    action      VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    row_pk      VARCHAR(40) NOT NULL,
    actor_id    INTEGER REFERENCES STUDENT(student_id) ON DELETE SET NULL,
    old_data    JSONB,
    new_data    JSONB,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Phase 2 indexes
-- ------------------------------------------------------------
-- Full-text search: GIN inverted index over the generated tsvector
CREATE INDEX idx_document_search_tsv ON DOCUMENT USING GIN (search_tsv);
-- Vector similarity: HNSW graph index using cosine distance (<=>)
CREATE INDEX idx_chunk_embedding_hnsw ON DOC_CHUNK
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
-- Partial index: the embedding worker only ever looks for unfinished documents
CREATE INDEX idx_document_embedding_todo ON DOCUMENT(doc_id) WHERE embedding_status <> 'ready';
-- Partial index: the public feed is the most common listing
CREATE INDEX idx_document_public_recent ON DOCUMENT(upload_date DESC) WHERE visibility = 'public';
CREATE INDEX idx_audit_logged_at   ON AUDIT_LOG(logged_at DESC);
CREATE INDEX idx_searchlog_time    ON SEARCH_LOG(searched_at DESC);
-- Case-insensitive look-up of a query string for analytics (expression index)
CREATE INDEX idx_searchlog_query_ci ON SEARCH_LOG (LOWER(query_text));

-- ------------------------------------------------------------
-- Data dictionary comments (read back by the report generator)
-- ------------------------------------------------------------
COMMENT ON TABLE STUDENT          IS 'Registered user. role = student | admin (platform moderator).';
COMMENT ON TABLE COURSE           IS 'A course offered in the programme; scopes documents, enrollments and groups.';
COMMENT ON TABLE DOCUMENT         IS 'An uploaded note/paper with its extracted text and access level.';
COMMENT ON TABLE TAG              IS 'Normalised topic label (lower-case, hyphenated).';
COMMENT ON TABLE STUDY_GROUP      IS 'A study group run for one course, capped at max_members.';
COMMENT ON TABLE SEARCH_LOG       IS 'Every search a student runs; also an interest signal for matching.';
COMMENT ON TABLE ENROLLMENT       IS 'M:N STUDENT-COURSE per semester.';
COMMENT ON TABLE DOCUMENT_TAG     IS 'M:N DOCUMENT-TAG.';
COMMENT ON TABLE BOOKMARK         IS 'M:N STUDENT-DOCUMENT saved items.';
COMMENT ON TABLE GROUP_MEMBERSHIP IS 'M:N STUDENT-STUDY_GROUP with a per-group role.';
COMMENT ON TABLE DOC_CHUNK        IS 'Weak entity: ~800-char passage of a document plus its 384-d embedding.';
COMMENT ON TABLE AUDIT_LOG        IS 'Append-only change history written by triggers.';

COMMENT ON COLUMN STUDENT.password_hash      IS 'bcrypt hash (cost 10); CHECK rejects anything else.';
COMMENT ON COLUMN STUDENT.role               IS 'System role: student or admin.';
COMMENT ON COLUMN STUDENT.is_active          IS 'Admins can deactivate an account without deleting its data.';
COMMENT ON COLUMN DOCUMENT.visibility        IS 'public = everyone, course = enrolled students, private = owner only.';
COMMENT ON COLUMN DOCUMENT.content           IS 'Plain text extracted from the uploaded file.';
COMMENT ON COLUMN DOCUMENT.search_tsv        IS 'Generated weighted tsvector: title (A), description (B), content (C).';
COMMENT ON COLUMN DOCUMENT.embedding_status  IS 'pending until every chunk has an embedding, then ready.';
COMMENT ON COLUMN DOC_CHUNK.embedding        IS '384-d all-MiniLM-L6-v2 sentence embedding, L2-normalised.';
COMMENT ON COLUMN SEARCH_LOG.query_embedding IS 'Embedding of the query text; feeds the interest profile.';
COMMENT ON COLUMN STUDY_GROUP.created_by     IS 'Creator; NULL if the account was deleted (group survives).';
COMMENT ON COLUMN AUDIT_LOG.actor_id         IS 'User who made the change, read from the app.current_user_id setting.';

-- remaining column descriptions (the report's data dictionary is generated from these)
COMMENT ON COLUMN STUDENT.student_id          IS 'Surrogate key.';
COMMENT ON COLUMN STUDENT.full_name           IS 'Display name; trimmed by trigger.';
COMMENT ON COLUMN STUDENT.email               IS 'Login id; lower-cased by trigger, unique case-insensitively.';
COMMENT ON COLUMN STUDENT.program             IS 'Degree programme, e.g. B.Tech CSE.';
COMMENT ON COLUMN STUDENT.year_of_study       IS 'Year 1-6.';
COMMENT ON COLUMN STUDENT.created_at          IS 'Registration time.';
COMMENT ON COLUMN STUDENT.last_login_at       IS 'Updated on every successful login.';
COMMENT ON COLUMN COURSE.course_id            IS 'Surrogate key.';
COMMENT ON COLUMN COURSE.course_code          IS 'University course code, e.g. UE23CS351A.';
COMMENT ON COLUMN COURSE.course_title         IS 'Course name.';
COMMENT ON COLUMN COURSE.department           IS 'Offering department.';
COMMENT ON COLUMN DOCUMENT.doc_id             IS 'Surrogate key.';
COMMENT ON COLUMN DOCUMENT.title              IS 'Title shown in listings (search weight A).';
COMMENT ON COLUMN DOCUMENT.description        IS 'One-line summary (search weight B).';
COMMENT ON COLUMN DOCUMENT.file_path          IS 'Random stored file name (never the client name).';
COMMENT ON COLUMN DOCUMENT.file_type          IS 'pdf | txt | md.';
COMMENT ON COLUMN DOCUMENT.file_size_bytes    IS 'Size of the uploaded file, 1 B - 10 MB.';
COMMENT ON COLUMN DOCUMENT.upload_date        IS 'Upload time.';
COMMENT ON COLUMN DOCUMENT.updated_at         IS 'Last edit, stamped by trigger.';
COMMENT ON COLUMN DOCUMENT.student_id         IS 'Owner (UPLOADS).';
COMMENT ON COLUMN DOCUMENT.course_id          IS 'Course the note belongs to (BELONGS_TO); optional.';
COMMENT ON COLUMN TAG.tag_id                  IS 'Surrogate key.';
COMMENT ON COLUMN TAG.tag_name                IS 'Normalised label, e.g. query-optimization.';
COMMENT ON COLUMN STUDY_GROUP.group_id        IS 'Surrogate key.';
COMMENT ON COLUMN STUDY_GROUP.group_name      IS 'Unique within its course.';
COMMENT ON COLUMN STUDY_GROUP.description     IS 'What the group works on.';
COMMENT ON COLUMN STUDY_GROUP.max_members     IS 'Seat limit 2-20, enforced by trigger on join.';
COMMENT ON COLUMN STUDY_GROUP.created_at      IS 'Creation time.';
COMMENT ON COLUMN STUDY_GROUP.course_id       IS 'Course the group is run for (RUN_FOR).';
COMMENT ON COLUMN SEARCH_LOG.log_id           IS 'Surrogate key.';
COMMENT ON COLUMN SEARCH_LOG.query_text       IS 'What the student typed.';
COMMENT ON COLUMN SEARCH_LOG.searched_at      IS 'Search time.';
COMMENT ON COLUMN SEARCH_LOG.student_id       IS 'Who searched (SEARCHES).';
COMMENT ON COLUMN SEARCH_LOG.search_mode      IS 'keyword | semantic | hybrid.';
COMMENT ON COLUMN SEARCH_LOG.result_count     IS 'Hits returned; 0 marks a content gap.';
COMMENT ON COLUMN ENROLLMENT.student_id       IS 'Enrolled student.';
COMMENT ON COLUMN ENROLLMENT.course_id        IS 'Course taken.';
COMMENT ON COLUMN ENROLLMENT.semester         IS 'Format YYYY-ODD or YYYY-EVEN.';
COMMENT ON COLUMN DOCUMENT_TAG.doc_id         IS 'Tagged document.';
COMMENT ON COLUMN DOCUMENT_TAG.tag_id         IS 'Applied tag.';
COMMENT ON COLUMN BOOKMARK.student_id         IS 'Who saved it.';
COMMENT ON COLUMN BOOKMARK.doc_id             IS 'Saved document.';
COMMENT ON COLUMN BOOKMARK.bookmarked_at      IS 'When it was saved.';
COMMENT ON COLUMN GROUP_MEMBERSHIP.group_id   IS 'Group joined.';
COMMENT ON COLUMN GROUP_MEMBERSHIP.student_id IS 'Member.';
COMMENT ON COLUMN GROUP_MEMBERSHIP.role       IS 'admin | member (per group).';
COMMENT ON COLUMN GROUP_MEMBERSHIP.joined_at  IS 'Join time; oldest member inherits admin.';
COMMENT ON COLUMN DOC_CHUNK.chunk_id          IS 'Surrogate key (partial key is chunk_index).';
COMMENT ON COLUMN DOC_CHUNK.doc_id            IS 'Owning document (identifying FK).';
COMMENT ON COLUMN DOC_CHUNK.chunk_index       IS 'Position of the passage inside its document.';
COMMENT ON COLUMN DOC_CHUNK.chunk_text        IS 'Passage text, at most 800 characters.';
COMMENT ON COLUMN DOC_CHUNK.embedded_at       IS 'When the vector was computed.';
COMMENT ON COLUMN AUDIT_LOG.audit_id          IS 'Surrogate key.';
COMMENT ON COLUMN AUDIT_LOG.table_name        IS 'Table that changed.';
COMMENT ON COLUMN AUDIT_LOG.action            IS 'INSERT | UPDATE | DELETE.';
COMMENT ON COLUMN AUDIT_LOG.row_pk            IS 'Primary key of the changed row.';
COMMENT ON COLUMN AUDIT_LOG.old_data          IS 'Row before the change (JSONB, secrets removed).';
COMMENT ON COLUMN AUDIT_LOG.new_data          IS 'Row after the change (JSONB, secrets removed).';
COMMENT ON COLUMN AUDIT_LOG.logged_at         IS 'Change time.';

-- ============================================================
-- ScholarMesh: Semantic Notes Discovery & Study Group Matching
-- 01 -- Phase 1 relational schema (DDL), corrected
-- Database: PostgreSQL 17 (+ pgvector, enabled in 02)
-- ============================================================
-- Fixes applied to the Week-4 (Phase 1) script -- each is marked "FIX" below:
--   FIX 1  TIMESTAMP -> TIMESTAMPTZ so every timestamp is unambiguous.
--   FIX 2  Email uniqueness is now case-insensitive (UNIQUE index on LOWER(email)).
--   FIX 3  STUDY_GROUP.created_by: CASCADE deleted a whole group (and everyone's
--          membership) when its creator deleted their account. Now SET NULL;
--          the admin role is handed to another member by a trigger (05).
--   FIX 4  A course can no longer hold two groups with the same name.
--   FIX 5  Removed idx_tag_name: the UNIQUE constraint already builds that index.
--   FIX 6  Replaced idx_document_visibility (only 3 distinct values -> useless)
--          with a composite (course_id, visibility) index that matches the
--          access-control predicate.
--   FIX 7  Added the missing indexes on the 2nd column of each composite PK
--          (reverse look-ups such as "groups of student X" were full scans).
-- ============================================================

DROP TABLE IF EXISTS AUDIT_LOG        CASCADE;
DROP TABLE IF EXISTS DOC_CHUNK        CASCADE;
DROP TABLE IF EXISTS GROUP_MEMBERSHIP CASCADE;
DROP TABLE IF EXISTS BOOKMARK         CASCADE;
DROP TABLE IF EXISTS DOCUMENT_TAG     CASCADE;
DROP TABLE IF EXISTS ENROLLMENT       CASCADE;
DROP TABLE IF EXISTS SEARCH_LOG       CASCADE;
DROP TABLE IF EXISTS STUDY_GROUP      CASCADE;
DROP TABLE IF EXISTS TAG              CASCADE;
DROP TABLE IF EXISTS DOCUMENT         CASCADE;
DROP TABLE IF EXISTS COURSE           CASCADE;
DROP TABLE IF EXISTS STUDENT          CASCADE;

-- ------------------------------------------------------------
-- 1. STUDENT (strong entity)
-- ------------------------------------------------------------
CREATE TABLE STUDENT (
    student_id      SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(120) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    program         VARCHAR(80),
    year_of_study   SMALLINT CHECK (year_of_study BETWEEN 1 AND 6),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP      -- FIX 1
);
CREATE UNIQUE INDEX uq_student_email_ci ON STUDENT (LOWER(email));      -- FIX 2

-- ------------------------------------------------------------
-- 2. COURSE (strong entity)
-- ------------------------------------------------------------
CREATE TABLE COURSE (
    course_id       SERIAL PRIMARY KEY,
    course_code     VARCHAR(20) NOT NULL UNIQUE,
    course_title    VARCHAR(150) NOT NULL,
    department      VARCHAR(80)
);

-- ------------------------------------------------------------
-- 3. DOCUMENT (strong entity; FKs from UPLOADS 1:N, BELONGS_TO N:1)
-- ------------------------------------------------------------
CREATE TABLE DOCUMENT (
    doc_id          SERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    file_path       VARCHAR(255) NOT NULL,
    file_type       VARCHAR(20)  NOT NULL,
    visibility      VARCHAR(10)  NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('public','course','private')),
    vector_id       VARCHAR(64),   -- Phase 1 pointer to the vector store; replaced in 02
    upload_date     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- FIX 1
    student_id      INTEGER NOT NULL REFERENCES STUDENT(student_id) ON DELETE CASCADE,
    course_id       INTEGER REFERENCES COURSE(course_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- 4. TAG (strong entity)
-- ------------------------------------------------------------
CREATE TABLE TAG (
    tag_id          SERIAL PRIMARY KEY,
    tag_name        VARCHAR(50) NOT NULL UNIQUE
);

-- ------------------------------------------------------------
-- 5. STUDY_GROUP (FKs from CREATES 1:N, RUN_FOR N:1)
-- ------------------------------------------------------------
CREATE TABLE STUDY_GROUP (
    group_id        SERIAL PRIMARY KEY,
    group_name      VARCHAR(100) NOT NULL,
    max_members     SMALLINT NOT NULL DEFAULT 6 CHECK (max_members > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- FIX 1
    course_id       INTEGER NOT NULL REFERENCES COURSE(course_id)  ON DELETE CASCADE,
    created_by      INTEGER REFERENCES STUDENT(student_id) ON DELETE SET NULL,  -- FIX 3
    CONSTRAINT uq_group_name_per_course UNIQUE (course_id, group_name)  -- FIX 4
);

-- ------------------------------------------------------------
-- 6. SEARCH_LOG (FK from SEARCHES 1:N)
-- ------------------------------------------------------------
CREATE TABLE SEARCH_LOG (
    log_id          SERIAL PRIMARY KEY,
    query_text      VARCHAR(255) NOT NULL,
    searched_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- FIX 1
    student_id      INTEGER NOT NULL REFERENCES STUDENT(student_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 7. ENROLLMENT (M:N associative entity: STUDENT <-> COURSE)
-- ------------------------------------------------------------
CREATE TABLE ENROLLMENT (
    student_id      INTEGER NOT NULL REFERENCES STUDENT(student_id) ON DELETE CASCADE,
    course_id       INTEGER NOT NULL REFERENCES COURSE(course_id)   ON DELETE CASCADE,
    semester        VARCHAR(20) NOT NULL,
    PRIMARY KEY (student_id, course_id, semester)
);

-- ------------------------------------------------------------
-- 8. DOCUMENT_TAG (M:N associative entity: DOCUMENT <-> TAG)
-- ------------------------------------------------------------
CREATE TABLE DOCUMENT_TAG (
    doc_id          INTEGER NOT NULL REFERENCES DOCUMENT(doc_id) ON DELETE CASCADE,
    tag_id          INTEGER NOT NULL REFERENCES TAG(tag_id)      ON DELETE CASCADE,
    PRIMARY KEY (doc_id, tag_id)
);

-- ------------------------------------------------------------
-- 9. BOOKMARK (M:N associative entity: STUDENT <-> DOCUMENT)
-- ------------------------------------------------------------
CREATE TABLE BOOKMARK (
    student_id      INTEGER NOT NULL REFERENCES STUDENT(student_id) ON DELETE CASCADE,
    doc_id          INTEGER NOT NULL REFERENCES DOCUMENT(doc_id)    ON DELETE CASCADE,
    bookmarked_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- FIX 1
    PRIMARY KEY (student_id, doc_id)
);

-- ------------------------------------------------------------
-- 10. GROUP_MEMBERSHIP (M:N associative entity: STUDENT <-> STUDY_GROUP)
-- ------------------------------------------------------------
CREATE TABLE GROUP_MEMBERSHIP (
    group_id        INTEGER NOT NULL REFERENCES STUDY_GROUP(group_id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES STUDENT(student_id)   ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL DEFAULT 'member'
                    CHECK (role IN ('admin','member')),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,     -- FIX 1
    PRIMARY KEY (group_id, student_id)
);

-- ------------------------------------------------------------
-- Supporting indexes (beyond the PK / UNIQUE auto-indexes)
-- ------------------------------------------------------------
CREATE INDEX idx_document_student          ON DOCUMENT(student_id);
CREATE INDEX idx_document_course_visibility ON DOCUMENT(course_id, visibility);   -- FIX 6
CREATE INDEX idx_studygroup_course         ON STUDY_GROUP(course_id);
CREATE INDEX idx_studygroup_creator        ON STUDY_GROUP(created_by);            -- FIX 7
CREATE INDEX idx_searchlog_student_time    ON SEARCH_LOG(student_id, searched_at DESC);
CREATE INDEX idx_enrollment_course         ON ENROLLMENT(course_id);              -- FIX 7
CREATE INDEX idx_document_tag_tag          ON DOCUMENT_TAG(tag_id);               -- FIX 7
CREATE INDEX idx_bookmark_doc              ON BOOKMARK(doc_id);                   -- FIX 7
CREATE INDEX idx_membership_student        ON GROUP_MEMBERSHIP(student_id);       -- FIX 7
-- FIX 5: idx_tag_name removed (TAG.tag_name UNIQUE already creates tag_tag_name_key)

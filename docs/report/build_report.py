"""Builds docs/report/report.html from the narrative sections, live database exports and test results.

  python docs/report/build_report.py
  cd web && npx tsx scripts/render-html.ts ../docs/report/report.html ../docs/ScholarMesh_Phase2_Report.pdf
Inputs (docs/report/data/): data-dictionary.json, indexes.json, queries-output.txt, vitest.json, playwright.json
"""
import html
import json
import re
from pathlib import Path

import report_content as rc

HERE = Path(__file__).parent
DATA = HERE / "data"
ROOT = HERE.parent.parent


def esc(text):
    return html.escape(str(text if text is not None else ""))


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


# ------------------------------------------------------------------ 6-7 ER + relational schema
ER_SECTION = """
<div class="landscape">
<h2 id="s6">6. Entity–relationship diagram</h2>
<figure class="wide">{svg}<figcaption>Figure 1 — Phase 2 ER diagram (Chen notation). New in Phase 2: the weak entity
DOC_CHUNK with its identifying relationship HAS_CHUNK, the AUDIT_LOG entity, and new attributes on STUDENT, DOCUMENT,
STUDY_GROUP and SEARCH_LOG.</figcaption></figure>
</div>
<h3>Relationships and cardinalities</h3>
<table class="grid compact">
<thead><tr><th>Relationship</th><th>Entities</th><th>Cardinality</th><th>Participation</th><th>Attributes</th></tr></thead>
<tbody>
<tr><td>ENROLLS_IN</td><td>STUDENT – COURSE</td><td>M : N</td><td>partial / partial</td><td>semester</td></tr>
<tr><td>UPLOADS</td><td>STUDENT – DOCUMENT</td><td>1 : N</td><td>partial / <b>total</b></td><td>—</td></tr>
<tr><td>BOOKMARKS</td><td>STUDENT – DOCUMENT</td><td>M : N</td><td>partial / partial</td><td>bookmarked_at</td></tr>
<tr><td>BELONGS_TO</td><td>DOCUMENT – COURSE</td><td>N : 1</td><td>partial / partial</td><td>—</td></tr>
<tr><td>TAGGED_WITH</td><td>DOCUMENT – TAG</td><td>M : N</td><td>partial / partial</td><td>—</td></tr>
<tr><td>HAS_CHUNK (identifying)</td><td>DOCUMENT – DOC_CHUNK</td><td>1 : N</td><td>partial / <b>total</b></td><td>—</td></tr>
<tr><td>CREATES</td><td>STUDENT – STUDY_GROUP</td><td>1 : N</td><td>partial / partial</td><td>—</td></tr>
<tr><td>RUN_FOR</td><td>STUDY_GROUP – COURSE</td><td>N : 1</td><td><b>total</b> / partial</td><td>—</td></tr>
<tr><td>MEMBER_OF</td><td>STUDENT – STUDY_GROUP</td><td>M : N</td><td>partial / <b>total</b></td><td>role, joined_at</td></tr>
<tr><td>SEARCHES</td><td>STUDENT – SEARCH_LOG</td><td>1 : N</td><td>partial / <b>total</b></td><td>—</td></tr>
<tr><td>PERFORMS</td><td>STUDENT – AUDIT_LOG</td><td>1 : N</td><td>partial / partial</td><td>— (actor may be the system)</td></tr>
</tbody></table>
"""

SCHEMA_SECTION = """
<h2 id="s7">7. ER-to-relational mapping and relational schema</h2>
<p>Mapping rules: every strong entity becomes a table with its key; a 1:N relationship puts the foreign key on the N side;
every M:N relationship becomes a junction table whose primary key combines both foreign keys and which carries the
relationship's attributes; the weak entity DOC_CHUNK takes its owner's key (<code>doc_id</code>) — its identity is
<code>(doc_id, chunk_index)</code>, enforced as <code>UNIQUE</code>, with a surrogate <code>chunk_id</code> for convenient references.</p>
<pre class="schema">STUDENT(<u>student_id</u>, full_name, email, password_hash, program, year_of_study, role, is_active, created_at, last_login_at)
COURSE(<u>course_id</u>, course_code, course_title, department)
DOCUMENT(<u>doc_id</u>, title, description, file_path, file_type, file_size_bytes, visibility, content, search_tsv,
         embedding_status, upload_date, updated_at, <i>student_id</i> → STUDENT, <i>course_id</i> → COURSE)
TAG(<u>tag_id</u>, tag_name)
STUDY_GROUP(<u>group_id</u>, group_name, description, max_members, created_at, <i>course_id</i> → COURSE, <i>created_by</i> → STUDENT)
SEARCH_LOG(<u>log_id</u>, query_text, search_mode, result_count, query_embedding, searched_at, <i>student_id</i> → STUDENT)
ENROLLMENT(<u><i>student_id</i>, <i>course_id</i>, semester</u>)
DOCUMENT_TAG(<u><i>doc_id</i>, <i>tag_id</i></u>)
BOOKMARK(<u><i>student_id</i>, <i>doc_id</i></u>, bookmarked_at)
GROUP_MEMBERSHIP(<u><i>group_id</i>, <i>student_id</i></u>, role, joined_at)
DOC_CHUNK(<u>chunk_id</u>, <i>doc_id</i> → DOCUMENT, chunk_index, chunk_text, embedding, embedded_at)   UNIQUE(doc_id, chunk_index)
AUDIT_LOG(<u>audit_id</u>, table_name, action, row_pk, <i>actor_id</i> → STUDENT, old_data, new_data, logged_at)</pre>
<p class="note">Underlined = primary key, italic = foreign key. Referential actions: deleting a student cascades to their
documents, bookmarks, memberships and searches, but sets <code>STUDY_GROUP.created_by</code> and
<code>AUDIT_LOG.actor_id</code> to NULL; deleting a course sets <code>DOCUMENT.course_id</code> to NULL (a trigger turns
course-only notes private) and cascades to its enrollments and groups.</p>
<p><b>Normalisation.</b> Every non-key attribute depends on the whole key and nothing but the key: multi-valued facts
(tags, enrollments, bookmarks, memberships) live in junction tables; course details are not repeated in documents or
groups. The only derived values are deliberate and maintained by the database — the generated <code>search_tsv</code> and
the materialized view used for analytics — so the schema is in BCNF.</p>
"""


def data_dictionary():
    out = ['<h2 id="s9">9. Data dictionary</h2>',
           '<p>Generated from the PostgreSQL catalog (<code>information_schema</code>, <code>pg_constraint</code> and the '
           '<code>COMMENT ON</code> descriptions stored with the schema) by <code>docs/report/data-dictionary.sql</code>.</p>']
    for table in load("data-dictionary.json"):
        out.append(f'<h3 class="dd">{esc(table["table_name"])}</h3><p class="dd-note">{esc(table["comment"])}</p>')
        out.append('<table class="grid dd"><thead><tr><th>Column</th><th>Type</th><th>Null</th><th>Default</th><th>Key</th><th>Description</th></tr></thead><tbody>')
        for col in table["columns"]:
            default = col["default"] or ""
            out.append(
                f'<tr><td><code>{esc(col["column"])}</code></td><td>{esc(col["type"])}</td>'
                f'<td>{"NOT NULL" if col["not_null"] else "null"}</td><td>{esc(default)}</td>'
                f'<td>{esc(col["keys"] or "")}</td><td>{esc(col["comment"])}</td></tr>')
        out.append("</tbody></table>")
        if table.get("checks"):
            items = "".join(f'<li><code>{esc(c["name"])}</code>: <code>{esc(c["definition"])}</code></li>' for c in table["checks"])
            out.append(f'<ul class="checks">{items}</ul>')
    return "\n".join(out)


# ------------------------------------------------------------------ 10 SQL implementation
def index_table():
    rows = []
    kinds = {"hnsw": "HNSW (vector)", "gin": "GIN (full text)"}
    for ix in load("indexes.json"):
        definition = ix["def"]
        method = re.search(r"USING (\w+)", definition).group(1)
        cols = definition.split(" USING ")[1]
        cols = re.sub(r"^\w+ ", "", cols)
        kind = kinds.get(method, "B-tree")
        if "UNIQUE" in definition:
            kind += ", unique"
        if " WHERE " in definition:
            kind += ", partial"
        if "lower(" in definition:
            kind += ", expression"
        rows.append(f'<tr><td>{esc(ix["table"])}</td><td><code>{esc(ix["name"])}</code></td><td>{esc(kind)}</td><td><code>{esc(cols)}</code></td></tr>')
    return ('<table class="grid compact"><thead><tr><th>Table</th><th>Index</th><th>Kind</th><th>Definition</th></tr></thead><tbody>'
            + "".join(rows) + "</tbody></table>")


SQL_SECTION_TOP = """
<h2 id="s10">10. SQL implementation</h2>
<p>The database is built by running the files in <code>db/</code> in order (<code>npm run db:setup</code>):</p>
<table class="grid compact">
<thead><tr><th>File</th><th>Contents</th></tr></thead><tbody>
<tr><td><code>01_schema.sql</code></td><td>Phase 1 DDL, corrected: <code>DROP TABLE … CASCADE</code>, 10 <code>CREATE TABLE</code>, keys, constraints, indexes</td></tr>
<tr><td><code>02_phase2_alter.sql</code></td><td><code>CREATE EXTENSION vector</code>; <code>ALTER TABLE … ADD COLUMN / ADD CONSTRAINT / DROP COLUMN / DROP CONSTRAINT</code>; new tables DOC_CHUNK and AUDIT_LOG; GIN, HNSW, partial and expression indexes; column comments</td></tr>
<tr><td><code>03_views.sql</code></td><td>4 views and 1 materialized view</td></tr>
<tr><td><code>04_functions.sql</code></td><td>12 functions and 3 procedures</td></tr>
<tr><td><code>05_triggers.sql</code></td><td>11 trigger functions attached as 14 triggers</td></tr>
<tr><td><code>06_security.sql</code></td><td>Grants for the least-privilege application role</td></tr>
<tr><td><code>07–09_seed*.sql</code></td><td>Demo data, inserted with <code>INSERT … SELECT</code> look-ups (no hard-coded ids)</td></tr>
<tr><td><code>10_important_queries.sql</code></td><td>Demonstration queries (§13)</td></tr>
</tbody></table>

<h3>10.1 CREATE, ALTER and DROP</h3>
<pre class="code">-- Phase 2 evolves the Phase 1 tables instead of re-creating them
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE STUDENT
    ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'student',
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT chk_student_role       CHECK (role IN ('student','admin')),
    ADD CONSTRAINT chk_student_pwd_bcrypt CHECK (password_hash ~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$');
ALTER TABLE DOCUMENT
    ADD COLUMN content TEXT,
    ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A')
       || setweight(to_tsvector('english', coalesce(description, '')), 'B')
       || setweight(to_tsvector('english', coalesce(content, '')), 'C')) STORED;
ALTER TABLE DOCUMENT DROP COLUMN vector_id;                         -- replaced by DOC_CHUNK
ALTER TABLE STUDY_GROUP DROP CONSTRAINT study_group_max_members_check;  -- superseded by 2..20 rule
CREATE TABLE DOC_CHUNK (
    chunk_id    SERIAL PRIMARY KEY,
    doc_id      INTEGER NOT NULL REFERENCES DOCUMENT(doc_id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    chunk_text  TEXT    NOT NULL CHECK (length(chunk_text) > 0),
    embedding   vector(384),
    embedded_at TIMESTAMPTZ,
    CONSTRAINT uq_chunk_per_doc   UNIQUE (doc_id, chunk_index),
    CONSTRAINT chk_chunk_embedded CHECK ((embedding IS NULL) = (embedded_at IS NULL)));
CREATE INDEX idx_chunk_embedding_hnsw ON DOC_CHUNK USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_document_search_tsv  ON DOCUMENT USING GIN (search_tsv);</pre>

<h3>10.2 Validation and integrity inside the database</h3>
<ul>
<li><b>25 CHECK constraints</b>, e.g. e-mail format, <i>password must be a bcrypt hash</i> (a plain-text password is impossible to store),
semester format <code>YYYY-ODD|EVEN</code>, tag format, file type and size, group size 2–20, course-only visibility needs a course.</li>
<li><b>Keys</b>: 12 primary keys (4 composite), 15 foreign keys with deliberate <code>CASCADE</code> / <code>SET NULL</code> actions,
unique constraints (course code, tag name, group name per course, chunk position) and a case-insensitive unique index on e-mail.</li>
<li><b>Triggers</b> normalise input (names, e-mails, tags) before CHECKs run and enforce cross-table rules a CHECK cannot express (§10.6).</li>
<li>The API validates the same rules first (zod) for friendly field messages; the database is the final authority.</li>
</ul>

<h3>10.3 Indexes</h3>
<p>34 indexes: B-tree (keys, foreign keys, composite), GIN for full text, HNSW for vectors, partial indexes for the public feed and the
embedding work queue, and expression indexes on <code>LOWER(email)</code> and <code>LOWER(query_text)</code>. Q16 in §13 shows the
planner using the B-tree, GIN and HNSW indexes.</p>
"""

SQL_SECTION_REST = """
<h3>10.4 Views and materialized view</h3>
<table class="grid compact"><thead><tr><th>View</th><th>Purpose</th></tr></thead><tbody>
<tr><td><code>v_document_catalog</code></td><td>Document + owner + course + tag array + bookmark and chunk counts (LATERAL sub-queries) — the base of every listing and search result</td></tr>
<tr><td><code>v_group_overview</code></td><td>Group + course + live member count and seats left (GROUP BY)</td></tr>
<tr><td><code>v_doc_centroid</code></td><td>One vector per document: <code>AVG(embedding)</code> over its passages</td></tr>
<tr><td><code>v_student_interest</code></td><td>Interest vector per student from uploads, bookmarks and recent searches (UNION ALL + AVG + FILTER)</td></tr>
<tr><td><code>mv_course_engagement</code> (materialized)</td><td>Per-course students, notes, saves, groups and members for the admin dashboard; unique index allows
<code>REFRESH … CONCURRENTLY</code> through the SECURITY DEFINER function <code>fn_refresh_course_stats()</code></td></tr>
</tbody></table>

<h3>10.5 Stored functions and procedures</h3>
<table class="grid compact"><thead><tr><th>Routine</th><th>Kind</th><th>What it does</th></tr></thead><tbody>
<tr><td><code>fn_visible_doc_ids(student)</code></td><td>SQL, set-returning</td><td>The single access rule: public, own, course-only if enrolled, everything for admins</td></tr>
<tr><td><code>fn_can_view_document(student, doc)</code></td><td>SQL, boolean</td><td>Point check built on the function above</td></tr>
<tr><td><code>fn_search_scope(student, course, tag)</code></td><td>SQL</td><td>Visible documents narrowed by the search filters</td></tr>
<tr><td><code>fn_chunk_text(text, max)</code></td><td>PL/pgSQL</td><td>Paragraph/sentence-aware chunking (regex split, ordinality, packing)</td></tr>
<tr><td><code>fn_keyword_search</code></td><td>SQL</td><td><code>websearch_to_tsquery</code>, <code>ts_rank_cd</code>, <code>ts_headline</code> snippet with safe markers</td></tr>
<tr><td><code>fn_semantic_search</code></td><td>SQL</td><td>Nearest passages by <code>&lt;=&gt;</code>, best passage per document (<code>DISTINCT ON</code>), threshold</td></tr>
<tr><td><code>fn_hybrid_search</code></td><td>SQL</td><td>Reciprocal Rank Fusion of the two (window functions + FULL OUTER JOIN)</td></tr>
<tr><td><code>fn_similar_documents</code></td><td>SQL</td><td>"More like this" by centroid distance</td></tr>
<tr><td><code>fn_recommend_groups</code> / <code>fn_recommend_partners</code></td><td>SQL</td><td>Matching by interest-vector cosine + topic Jaccard</td></tr>
<tr><td><code>fn_student_stats(student)</code></td><td>SQL</td><td>Six dashboard counters in one round trip</td></tr>
<tr><td><code>fn_refresh_course_stats()</code></td><td>PL/pgSQL, SECURITY DEFINER</td><td>Refreshes the materialized view on behalf of the low-privilege app role</td></tr>
<tr><td><code>sp_join_group(student, group)</code></td><td>PROCEDURE</td><td>Locks the group row (<code>FOR UPDATE</code>), checks duplicates, inserts the membership</td></tr>
<tr><td><code>sp_leave_group(student, group)</code></td><td>PROCEDURE</td><td>Locks the group row, then deletes the membership; T7 hands over admin or deletes the empty group</td></tr>
<tr><td><code>sp_merge_tags(from, into)</code></td><td>PROCEDURE</td><td>Re-points documents to the surviving tag and deletes the old one, atomically</td></tr>
</tbody></table>
<p>Custom error codes (<code>SM001</code> group full, <code>SM002</code> not enrolled, <code>SM003</code> last admin, <code>SM004</code>
capacity below members, <code>SM404</code>, <code>SM409</code>) are mapped by the API to HTTP 409/403/404 with the database's message.</p>

<h3>10.6 Triggers</h3>
<table class="grid compact"><thead><tr><th>#</th><th>Trigger</th><th>Event</th><th>Rule enforced</th></tr></thead><tbody>
<tr><td>T1</td><td><code>trg_student_normalize</code></td><td>BEFORE INSERT/UPDATE · STUDENT</td><td>Trim name, lower-case e-mail</td></tr>
<tr><td>T2</td><td><code>trg_tag_normalize</code></td><td>BEFORE INSERT/UPDATE · TAG</td><td>"Query Tuning " → <code>query-tuning</code></td></tr>
<tr><td>T3</td><td><code>trg_document_before_write</code></td><td>BEFORE INSERT/UPDATE · DOCUMENT</td><td>Stamp <code>updated_at</code>; course deleted → note becomes private; new text → <code>pending</code></td></tr>
<tr><td>T4</td><td><code>trg_document_rechunk</code></td><td>AFTER INSERT/UPDATE OF content</td><td>Rebuild DOC_CHUNK rows from the text</td></tr>
<tr><td>T5</td><td><code>trg_membership_check</code></td><td>BEFORE INSERT · GROUP_MEMBERSHIP</td><td>Lock the group row; refuse if full (SM001) or not enrolled (SM002)</td></tr>
<tr><td>T6</td><td><code>trg_group_add_creator</code></td><td>AFTER INSERT · STUDY_GROUP</td><td>Creator becomes the group admin</td></tr>
<tr><td>T7</td><td><code>trg_group_admin_succession</code></td><td>AFTER DELETE · GROUP_MEMBERSHIP</td><td>Promote the longest-standing member; delete an empty group</td></tr>
<tr><td>T8</td><td><code>trg_group_last_admin_guard</code></td><td>BEFORE UPDATE OF role</td><td>Never demote the last admin (SM003)</td></tr>
<tr><td>T9</td><td><code>trg_group_capacity_guard</code></td><td>BEFORE UPDATE OF max_members</td><td>Cannot shrink below the member count (SM004)</td></tr>
<tr><td>T10</td><td><code>trg_enrollment_cleanup</code></td><td>AFTER DELETE · ENROLLMENT</td><td>Dropping a course leaves its groups</td></tr>
<tr><td>T11</td><td><code>trg_audit_student/document/course/group</code></td><td>AFTER INSERT/UPDATE/DELETE</td><td>Append JSONB before/after images and the acting user to AUDIT_LOG (password and content stripped)</td></tr>
</tbody></table>

<h3>10.7 Transactions and concurrency</h3>
<ul>
<li><b>Upload</b>: <code>BEGIN</code> → insert DOCUMENT (T4 writes chunks) → upsert tags → link tags → <code>COMMIT</code>. Any failure
rolls everything back and the API deletes the stored file, so no orphan rows or files remain.</li>
<li><b>Join a group</b>: <code>CALL sp_join_group</code> locks the group row with <code>SELECT … FOR UPDATE</code>. Two students racing for
the last seat are serialised — one succeeds, the other receives SM001. This is proven by an automated test that opens two
connections and runs both joins at the same time (§16).</li>
<li><b>Leaving and member changes</b>: <code>CALL sp_leave_group</code>, and the promote/remove endpoints, lock the same group row
first. Without it, the last two members leaving at the same instant could each see the other still present and leave an empty
group with no admin; with it the second leave sees the first and deletes the group (also proven by a two-connection test).</li>
<li><b>Audit attribution</b>: every write transaction runs <code>SELECT set_config('app.current_user_id', $1, true)</code>; the setting is
local to the transaction, so the audit trigger always records the right user even with pooled connections.</li>
<li>All writes that change several rows (admin role changes, deleting courses or users, leaving groups) run inside <code>withTransaction()</code>.</li>
</ul>

<h3>10.8 Database security</h3>
<ul>
<li>Two logins: <code>postgres</code> (owner, used only by the setup script) and <code>scholarmesh_app</code> (used by the web app) with
<code>SELECT/INSERT/UPDATE/DELETE</code> + <code>EXECUTE</code> only — it cannot create, alter or drop objects (tested: error 42501).</li>
<li><code>AUDIT_LOG</code> is append-only for the app role (<code>UPDATE/DELETE/TRUNCATE</code> revoked).</li>
<li>Passwords: bcrypt (cost 10) in the app, enforced by a CHECK; all credentials come from environment files that are not committed.</li>
<li>Every SQL statement in the app is parameterised (<code>$1, $2 …</code>); no SQL is built from user input.</li>
</ul>
"""

ADVANCED = """
<h2 id="s12">12. Advanced database features — summary</h2>
<table class="grid"><thead><tr><th>Feature (brief requires ≥ 4)</th><th>Where</th><th>Used by the app for</th></tr></thead><tbody>
<tr><td>Transactions</td><td><code>withTransaction()</code>, procedures, savepoints in tests</td><td>Upload, joins, admin changes; race-safe seats</td></tr>
<tr><td>Views</td><td>4 views</td><td>Catalogue, group overview, centroids, interest profiles</td></tr>
<tr><td>Materialized view</td><td><code>mv_course_engagement</code></td><td>Admin analytics</td></tr>
<tr><td>Stored functions / procedures</td><td>12 functions, 3 procedures</td><td>Access control, all search modes, recommendations, joining/leaving groups, tag merge</td></tr>
<tr><td>Triggers</td><td>14 triggers</td><td>Chunking, seat limits, enrollment rule, admin hand-over, audit</td></tr>
<tr><td>Indexing</td><td>34 indexes (B-tree, composite, partial, expression, GIN, HNSW)</td><td>Every listing and search</td></tr>
<tr><td>Full-text search</td><td>Generated weighted <code>tsvector</code> + GIN</td><td>Keyword and hybrid search, highlighted snippets</td></tr>
<tr><td>Vector similarity search</td><td>pgvector + HNSW, cosine</td><td>Semantic/hybrid search, similar notes, matching</td></tr>
<tr><td>Window functions, CTEs</td><td>RANK, ROW_NUMBER, SUM OVER, COUNT OVER</td><td>Rank fusion, pagination totals, leaderboards</td></tr>
<tr><td>Semi-structured data</td><td>JSONB in AUDIT_LOG</td><td>Before/after images of changes</td></tr>
<tr><td>Role-based privileges</td><td>GRANT/REVOKE, SECURITY DEFINER</td><td>Least-privilege app login</td></tr>
</tbody></table>
"""

QUERY_PICKS = [
    ("Q1", "JOIN across four tables, GROUP BY, ORDER BY"),
    ("Q2", "GROUP BY + HAVING with aggregate functions"),
    ("Q4", "Correlated subquery with NOT EXISTS"),
    ("Q5", "CTE + scalar subqueries"),
    ("Q6", "Window function RANK() OVER (PARTITION BY …)"),
    ("Q10", "Full-text search"),
    ("Q11", "Vector similarity search"),
    ("Q12", "Hybrid search (Reciprocal Rank Fusion)"),
    ("Q13", "Study-group and partner matching"),
    ("Q14", "INSERT, UPDATE, DELETE, INSERT … SELECT inside a transaction, then ROLLBACK"),
    ("Q15", "Stored procedure + trigger rejecting a full group"),
    ("Q16", "EXPLAIN ANALYZE — indexes in use"),
]


def split_blocks(text, marker):
    parts = re.split(rf"(?m)^.*{marker}(Q\d+)\b", text)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def important_queries():
    sql = (ROOT / "db" / "10_important_queries.sql").read_text(encoding="utf-8")
    output = (DATA / "queries-output.txt").read_text(encoding="utf-8")
    sql_blocks = split_blocks(sql, r"\\echo '\\n=== ")
    out_blocks = split_blocks(output, "=== ")
    parts = ['<h2 id="s13">13. Important queries</h2>',
             '<p>From <code>db/10_important_queries.sql</code>, executed against the seeded database; the output below is the '
             'real psql output (long results trimmed). Data changes run inside <code>BEGIN … ROLLBACK</code>.</p>']
    for qid, label in QUERY_PICKS:
        q_sql = sql_blocks.get(qid, "")
        q_sql = "\n".join(line for line in q_sql.splitlines()[1:] if not line.startswith("\\echo")).strip()
        q_out = "\n".join(out_blocks.get(qid, "").splitlines()[1:]).strip()
        q_out_lines = q_out.splitlines()
        if len(q_out_lines) > 40:
            q_out = "\n".join(q_out_lines[:40] + ["… (trimmed)"])
        parts.append(f'<div class="query"><h4>{qid} — {esc(label)}</h4><pre class="code">{esc(q_sql)}</pre>'
                     f'<pre class="output">{esc(q_out)}</pre></div>')
    return "\n".join(parts)


API = """
<div class="landscape">
<h2 id="s14">14. System architecture</h2>
<figure class="wide">{svg}<figcaption>Figure 2 — Architecture. The browser never talks to the database; every read and write goes
through server code that re-checks the user and uses parameterised SQL.</figcaption></figure>
</div>
<h3>Request flow (example: a semantic search)</h3>
<ol>
<li>The browser calls <code>GET /api/search?q=…&amp;mode=semantic</code> with the session cookie.</li>
<li><code>proxy.ts</code> only checks that a validly signed cookie exists; the route handler re-reads the user from STUDENT (role, is_active) and validates the query with zod — so deactivation, deletion and promotion take effect immediately.</li>
<li>The server embeds the question with the local model (cached for repeated questions).</li>
<li>One SQL statement calls <code>fn_semantic_search</code>, which applies <code>fn_visible_doc_ids</code> and the HNSW index, and joins
<code>v_document_catalog</code> for display fields.</li>
<li>The query and its vector are written to SEARCH_LOG (analytics and interest profile); results return as <code>{{ ok, data }}</code>.</li>
</ol>
<h3>API endpoints (34 handlers in 22 routes)</h3>
<table class="grid compact"><thead><tr><th>Endpoint</th><th>Methods</th><th>Who</th><th>Purpose</th></tr></thead><tbody>
<tr><td><code>/api/auth/register</code>, <code>/login</code>, <code>/logout</code></td><td>POST</td><td>public / any</td><td>Account and session (rate-limited)</td></tr>
<tr><td><code>/api/search</code></td><td>GET</td><td>signed in</td><td>Keyword / semantic / hybrid search with filters</td></tr>
<tr><td><code>/api/documents</code></td><td>GET, POST</td><td>signed in</td><td>Library listing; multipart upload</td></tr>
<tr><td><code>/api/documents/:id</code></td><td>GET, PATCH, DELETE</td><td>viewer / owner / admin</td><td>Read, edit metadata, delete</td></tr>
<tr><td><code>/api/documents/:id/file</code>, <code>/bookmark</code></td><td>GET · POST, DELETE</td><td>viewer</td><td>Download; save / unsave</td></tr>
<tr><td><code>/api/courses</code>, <code>/api/enrollments</code></td><td>GET · POST, DELETE</td><td>student</td><td>Catalogue; enroll / drop</td></tr>
<tr><td><code>/api/groups</code>, <code>/api/groups/:id</code></td><td>GET, POST · GET, PATCH, DELETE</td><td>student / group admin</td><td>List, create, view, edit, delete groups</td></tr>
<tr><td><code>/api/groups/:id/membership</code></td><td>POST, DELETE</td><td>student</td><td>Join (procedure) / leave</td></tr>
<tr><td><code>/api/groups/:id/members/:studentId</code></td><td>PATCH, DELETE</td><td>group admin</td><td>Promote / demote / remove members</td></tr>
<tr><td><code>/api/recommendations</code></td><td>GET</td><td>student</td><td>Matched groups and partners</td></tr>
<tr><td><code>/api/admin/stats</code>, <code>/refresh-stats</code>, <code>/embeddings</code></td><td>GET · POST · POST</td><td>admin</td><td>Analytics, MV refresh, embedding job</td></tr>
<tr><td><code>/api/admin/users/:id</code></td><td>PATCH, DELETE</td><td>admin</td><td>Role, activation, deletion (not self)</td></tr>
<tr><td><code>/api/admin/courses</code>, <code>/courses/:id</code>, <code>/tags/merge</code></td><td>POST · PATCH, DELETE · POST</td><td>admin</td><td>Course catalogue; tag merge</td></tr>
</tbody></table>
<h3>Application security</h3>
<ul>
<li>bcrypt password hashes; constant-cost login (a dummy hash is checked for unknown e-mails); 10 attempts per 15 minutes per account, plus per-IP limits when a trusted reverse proxy supplies the address (a client-sent <code>X-Forwarded-For</code> is never trusted).</li>
<li>Session: HS256 JWT in an <code>httpOnly</code>, <code>SameSite=Lax</code> cookie (<code>Secure</code> in production); role and active flag re-read from the database on every request.</li>
<li>CSRF: every POST/PATCH/DELETE must come from the same origin. XSS: React escapes output; search highlights use markers that are turned into
<code>&lt;mark&gt;</code> elements, never injected as HTML.</li>
<li>Uploads: body size checked before parsing (5 MB), extension whitelist, PDF magic-byte check, at most 150 pages and 300 000 characters, 30 uploads per hour per user, random server-side file names (no path traversal).</li>
<li>Private notes never leak through aggregates: tag lists, trending topics, course note counts, interest profiles and group matching all count only notes the viewer may see. Group pages are visible only to members, students of the course and admins.</li>
<li>Security headers (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy); generic 500 messages, details only in server logs.</li>
<li>Configuration only through environment variables, validated at start-up (<code>DATABASE_URL</code>, <code>AUTH_SECRET</code> ≥ 32 chars).</li>
</ul>
"""

SHOTS = [
    ("01-landing", "Landing page (signed out)"),
    ("02-login", "Login with validation and error messages"),
    ("03-student-dashboard", "Student dashboard — statistics (fn_student_stats), new notes in my courses, matched groups, classmates by interest similarity, trending topics (GROUP BY … HAVING), recent searches"),
    ("04-search-hybrid", "Hybrid search — a question with no shared keywords; ranks from the semantic side and cosine similarity"),
    ("05-search-keyword-no-results", "Keyword mode: “bcnf decomposition” finds nothing — no note contains the word “decomposition”"),
    ("06-search-semantic", "Semantic mode: the same question finds the normalization note by meaning"),
    ("07-library", "Library — filters, sorting and pagination over the visible documents"),
    ("08-document-detail", "Note page — metadata, passages, bookmark, download and “more like this” (centroid similarity)"),
    ("09-upload-form", "Upload form — file or pasted text, course, visibility, tags"),
    ("10-study-groups", "Study groups — best matches, own groups, other groups with live seat counts"),
    ("11-group-full-trigger", "Joining a full group: the database trigger refuses (“4 of 4 seats taken”) and the UI shows its message"),
    ("12-courses", "Courses — enroll per semester or drop"),
    ("13-mobile-dashboard", "Responsive layout on a 390 px phone screen"),
    ("14-admin-overview", "Admin overview — totals, searches per day by mode, embedding pipeline, materialized-view course engagement, RANK() leaderboard, popular questions and content gaps"),
    ("15-admin-users", "Admin — users, roles and activation"),
    ("16-admin-courses-tags", "Admin — course catalogue and tag merge (stored procedure)"),
    ("17-admin-audit-log", "Admin — audit log written by triggers, with the acting user"),
]


def screenshots():
    parts = ['<h2 id="s15">15. Application screenshots</h2>',
             '<p>Captured automatically from the production build by <code>web/scripts/screenshots.ts</code> (Playwright, 1440 px wide).</p>']
    for i, (name, caption) in enumerate(SHOTS, start=3):
        parts.append(f'<figure class="shot"><img src="../screenshots/{name}.png" alt="{esc(caption)}"/>'
                     f'<figcaption>Figure {i} — {esc(caption)}</figcaption></figure>')
    return "\n".join(parts)


def testing():
    vitest = load("vitest.json")
    pw = load("playwright.json")
    rows = []
    for f in vitest["testResults"]:
        file = f["name"].replace("\\", "/").split("/web/")[-1]
        layer = "Database integration" if "/db/" in file else "Unit"
        for a in f["assertionResults"]:
            name = " › ".join(a["ancestorTitles"] + [a["title"]])
            rows.append((layer, file, name, a["status"]))
    e2e = []

    def walk(suite, prefix):
        for spec in suite.get("specs", []):
            for t in spec["tests"]:
                status = t["results"][-1]["status"] if t["results"] else "skipped"
                e2e.append(("End-to-end (Chromium)", "tests/e2e/app.spec.ts", " › ".join(prefix + [spec["title"]]), status))
        for child in suite.get("suites", []):
            walk(child, prefix + ([child["title"]] if child.get("title") and not child["title"].endswith(".ts") else []))

    for s in pw["suites"]:
        walk(s, [])
    rows += e2e
    passed = sum(1 for r in rows if r[3] == "passed")
    unit = sum(1 for r in rows if r[0] == "Unit")
    dbt = sum(1 for r in rows if r[0] == "Database integration")
    table = "".join(
        f'<tr><td>{i}</td><td>{esc(layer)}</td><td>{esc(name)}</td><td class="{"ok" if st == "passed" else "bad"}">{esc(st)}</td></tr>'
        for i, (layer, _file, name, st) in enumerate(rows, start=1))
    return f"""
<h2 id="s16">16. Testing</h2>
<div class="cover-stats small">
  <div><b>{passed}/{len(rows)}</b><span>tests passed</span></div>
  <div><b>{unit}</b><span>unit</span></div>
  <div><b>{dbt}</b><span>database integration</span></div>
  <div><b>{len(e2e)}</b><span>end-to-end</span></div>
</div>
<ul>
<li><b>Unit tests</b> (Vitest): input validation, password hashing (the hash satisfies the database CHECK), session tokens (expired, forged and
tampered tokens rejected), error mapping, CSRF guard, rate limiter, safe highlighting.</li>
<li><b>Database integration tests</b> (Vitest + pg) run as the application role against the real database, each inside
<code>BEGIN … ROLLBACK</code> with savepoints, so they can assert that a statement <i>fails</i> with the right SQLSTATE and leave no data behind.
They cover constraints, every trigger, access control, the three search modes, recommendations, procedures, privileges and a real
two-connection race for the last seat.</li>
<li><b>End-to-end tests</b> (Playwright, Chromium) drive the production build: login, semantic and keyword search, privacy of other students' notes,
upload and delete, the full-group rule, admin-only pages.</li>
<li>Also checked: TypeScript strict type-check, ESLint, production build, and the SQL demonstration script (only the intended "group is full" error).</li>
<li><b>Independent code and security review</b> of the finished code: 15 distinct findings (redirect loop for stale sessions, private-note metadata in tag
counts and recommendations, a leave race, upload limits, rate-limit spoofing, open redirect, …). All were fixed and covered by new tests,
except open self-enrollment, which is documented as a limitation (§3).</li>
</ul>
<p>Commands: <code>npm test</code>, <code>npm run test:e2e</code>, <code>npm run typecheck</code>, <code>npm run lint</code> (in <code>web/</code>).</p>
<table class="grid compact tests"><thead><tr><th>#</th><th>Layer</th><th>Test case</th><th>Result</th></tr></thead><tbody>{table}</tbody></table>
"""


COVERAGE = """
<h2 id="s17">17. Requirement coverage</h2>
<table class="grid compact"><thead><tr><th>Requirement (project brief)</th><th>Evidence</th></tr></thead><tbody>
<tr><td>Meaningful problem, beyond CRUD</td><td>§1; semantic retrieval, matching, DB-enforced rules</td></tr>
<tr><td>SQL + vector database (Option 2), justified</td><td>PostgreSQL 17 + pgvector; §8</td></tr>
<tr><td>ER diagram → relational schema; entities, attributes, PK, FK, relationships, constraints</td><td>§6, §7, §9</td></tr>
<tr><td>Vector component: data model, embeddings, metadata, indexes, retrieval strategy</td><td>§11</td></tr>
<tr><td>DDL: CREATE, ALTER, DROP, keys, constraints, indexes, views</td><td>§10.1–10.4, <code>db/01–03</code></td></tr>
<tr><td>DML: INSERT, UPDATE, DELETE, SELECT with JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries</td><td>§13 Q1–Q14; the app's repositories</td></tr>
<tr><td>≥ 4 advanced features</td><td>§12 (11 listed)</td></tr>
<tr><td>Next.js interface with forms, tables, search, filtering, dashboards</td><td>§15</td></tr>
<tr><td>Backend/API layer; no hard-coded credentials; environment variables</td><td>§14; <code>.env.example</code> files</td></tr>
<tr><td>Authentication and ≥ 2 roles</td><td>student / admin (+ group admin / member); §4</td></tr>
<tr><td>Validation at database level; consistency and integrity</td><td>§10.2, §10.6, §10.7; tests in §16</td></tr>
<tr><td>Security: no plain-text passwords or credentials</td><td>bcrypt + CHECK; §10.8, §14</td></tr>
<tr><td>Documentation, testing results, screenshots</td><td>This report; README</td></tr>
<tr><td>Git/GitHub with individual commits; README</td><td>§18; <code>README.md</code></td></tr>
</tbody></table>
"""

CONTRIB = """
<h2 id="s18">18. Individual contributions and version control</h2>
<p class="todo-block">Fill in before submission: replace the placeholders with each member's name and what they actually did, so it matches
the commit history.</p>
<table class="grid"><thead><tr><th>Member</th><th>Database work</th><th>Application work</th></tr></thead><tbody>
<tr><td>Darshan (PES2UG24CS143)</td><td><span class="todo">e.g. schema &amp; Phase 1 fixes, triggers, search functions, seed data</span></td>
<td><span class="todo">e.g. search UI, upload pipeline, embedding worker</span></td></tr>
<tr><td><span class="todo">Member 2 (SRN)</span></td><td><span class="todo">e.g. views, procedures, grants, important queries</span></td>
<td><span class="todo">e.g. authentication, groups &amp; admin pages, tests</span></td></tr>
</tbody></table>
<p>Repository: <code>https://github.com/Darshanpawar7/DBMS-Mini-Project</code>. It contains <code>db/</code> (SQL), <code>web/</code> (Next.js app and tests) and <code>docs/</code> (this report, diagrams,
screenshots). Each member commits their own work from their own GitHub account (feature branches merged by pull request), so the history
shows individual contributions. Setup and run instructions are in <code>README.md</code>.</p>
"""

APPENDIX = """
<h2 id="sA">Appendix A — Running the project</h2>
<pre class="code">cp .env.example .env                 # choose database passwords
docker compose up -d                 # PostgreSQL 17 + pgvector on port 5433
cd web && cp .env.example .env.local # DATABASE_URL (app password) + AUTH_SECRET
npm install
npm run db:setup                     # schema, functions, triggers, grants, seed data
npm run db:embed                     # compute embeddings (downloads the 23 MB model once)
npm run dev                          # http://localhost:3000</pre>
<p>Demo logins: <code>admin@scholarmesh.test / Admin@12345</code> (admin), <code>ananya.rao@scholarmesh.test / Scholar@123</code> (student).</p>
"""

CSS = """
@page { size: A4; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Inter, Arial, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.5; margin: 0; }
h1, h2, h3, h4 { font-family: Georgia, "Times New Roman", serif; color: #1e1b4b; line-height: 1.25; }
h2 { font-size: 17pt; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #c7d2fe; break-before: page; }
h2.nb { break-before: auto; margin-top: 26px; }
@page wide { size: A4 landscape; }
.landscape { page: wide; }
.landscape figure svg { max-height: 150mm; }
h3 { font-size: 12.5pt; margin: 18px 0 6px; }
h4 { font-size: 11pt; margin: 14px 0 4px; }
p, li { margin: 4px 0; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 9pt; background: #f1f5f9; padding: 0 3px; border-radius: 3px; }
pre { font-family: Consolas, "Cascadia Mono", monospace; font-size: 8.2pt; line-height: 1.35; white-space: pre-wrap; word-break: break-word;
      border-radius: 6px; padding: 8px 10px; margin: 6px 0; break-inside: avoid; }
pre.code { background: #f8fafc; border: 1px solid #e2e8f0; }
pre.output { background: #0f172a; color: #e2e8f0; font-size: 7.4pt; }
pre.schema { background: #eef2ff; border: 1px solid #c7d2fe; font-size: 8.6pt; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; }
table.grid th, table.grid td { border: 1px solid #e2e8f0; padding: 4px 7px; text-align: left; vertical-align: top; }
table.grid th { background: #eef2ff; color: #312e81; font-weight: 600; }
table.compact { font-size: 9pt; }
table.dd { font-size: 8.6pt; }
table.dd td:nth-child(3) { white-space: nowrap; }
table.tests { font-size: 8.4pt; }
tr { break-inside: avoid; }
td.ok { color: #047857; font-weight: 600; }
td.bad { color: #b91c1c; font-weight: 600; }
h3.dd { margin-top: 14px; font-size: 11pt; }
.dd-note { color: #475569; font-size: 9pt; margin: 0 0 4px; }
ul.checks { font-size: 8.4pt; margin: 0 0 10px; padding-left: 18px; }
.callout { background: #fefce8; border-left: 4px solid #facc15; padding: 8px 12px; margin: 10px 0; border-radius: 4px; }
.formula { text-align: center; font-family: Georgia, serif; font-size: 11.5pt; background: #f8fafc; padding: 6px; border-radius: 6px; }
.note { color: #475569; font-size: 9.2pt; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
figure { margin: 10px 0 16px; break-inside: avoid; text-align: center; }
figure svg { width: 100%; height: auto; }
figure img { max-width: 100%; max-height: 225mm; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px; }
figcaption { font-size: 9pt; color: #475569; margin-top: 4px; }
.query { break-inside: auto; }
.cover { height: 260mm; display: flex; flex-direction: column; justify-content: center; }
.cover h1 { font-size: 46pt; margin: 6px 0 0; color: #312e81; }
.cover .kicker { text-transform: uppercase; letter-spacing: .14em; color: #4f46e5; font-weight: 700; font-size: 10pt; }
.cover .subtitle { font-size: 15pt; color: #334155; margin: 6px 0 26px; font-family: Georgia, serif; }
table.meta th { text-align: left; width: 32mm; color: #64748b; font-weight: 600; padding: 5px 8px 5px 0; vertical-align: top; }
table.meta td { padding: 5px 0; border-bottom: 1px solid #e2e8f0; }
.cover-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 26px; }
.cover-stats.small { grid-template-columns: repeat(4, 1fr); margin: 8px 0 14px; }
.cover-stats div { background: #eef2ff; border-radius: 8px; padding: 10px; text-align: center; }
.cover-stats b { display: block; font-size: 20pt; font-family: Georgia, serif; color: #312e81; }
.cover-stats span { font-size: 8.5pt; color: #475569; }
.todo { background: #fef3c7; color: #92400e; padding: 0 4px; border-radius: 3px; }
.todo-block { background: #fef3c7; color: #92400e; padding: 6px 10px; border-radius: 6px; }
nav.toc ol { columns: 2; font-size: 10pt; }
nav.toc a { color: #312e81; text-decoration: none; }
"""

TOC = [
    ("s1", "Problem statement and motivation"), ("s2", "Objectives"), ("s3", "Scope"),
    ("s4", "Users, roles and functional requirements"), ("s5", "Phase 1 review — issues found and fixed"),
    ("s6", "Entity–relationship diagram"), ("s7", "ER-to-relational mapping and relational schema"),
    ("s8", "Database choice and justification"), ("s9", "Data dictionary"), ("s10", "SQL implementation"),
    ("s11", "Vector database and semantic search"), ("s12", "Advanced database features — summary"),
    ("s13", "Important queries"), ("s14", "System architecture, API and security"), ("s15", "Application screenshots"),
    ("s16", "Testing"), ("s17", "Requirement coverage"), ("s18", "Individual contributions and version control"),
    ("s19", "Conclusion and future enhancements"),
]


def main():
    er_svg = (HERE / "er-diagram.svg").read_text(encoding="utf-8")
    arch_svg = (HERE / "architecture.svg").read_text(encoding="utf-8")
    toc = "".join(f'<li><a href="#{sid}">{esc(title)}</a></li>' for sid, title in TOC)
    body = "\n".join([
        rc.COVER,
        f'<h2 style="break-before: page">Contents</h2><nav class="toc"><ol>{toc}</ol><p>Appendix A — Running the project</p></nav>',
        rc.PROBLEM, rc.OBJECTIVES, rc.SCOPE, rc.REQUIREMENTS, rc.PHASE1_REVIEW,
        ER_SECTION.format(svg=er_svg), SCHEMA_SECTION, rc.JUSTIFICATION, data_dictionary(),
        SQL_SECTION_TOP, index_table(), SQL_SECTION_REST, rc.VECTOR, ADVANCED, important_queries(),
        API.format(svg=arch_svg), screenshots(), testing(), COVERAGE, CONTRIB, rc.CONCLUSION, APPENDIX,
    ])
    total_tests = load("vitest.json")["numTotalTests"] + load("playwright.json")["stats"]["expected"]
    body = body.replace("__TOTAL_TESTS__", str(total_tests))
    # short sections continue on the same page instead of starting a new one
    for sid in ("s2", "s3", "s8", "s12", "s17", "s18"):
        body = body.replace(f'<h2 id="{sid}">', f'<h2 id="{sid}" class="nb">')
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>ScholarMesh — Phase 2 Report</title><style>{CSS}</style></head>
<body>{body}</body></html>"""
    target = HERE / "report.html"
    target.write_text(page, encoding="utf-8")
    print(f"wrote {target} ({len(page) // 1024} KB)")


if __name__ == "__main__":
    main()

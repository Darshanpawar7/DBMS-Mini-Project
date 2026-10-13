"""Narrative sections of the Phase 2 report (HTML fragments). Assembled by build_report.py."""

COVER = """
<section class="cover">
  <p class="kicker">DBMS Mini Project · Level 3 · Phase 2 Submission</p>
  <h1>ScholarMesh</h1>
  <p class="subtitle">Semantic Research-Notes Discovery &amp; Study-Group Matchmaking Platform</p>
  <table class="meta">
    <tr><th>Course</th><td>DBMS Experiential Learning — Level 3 Project</td></tr>
    <tr><th>Institution</th><td>PES University, Electronic City Campus · Department of Computer Science and Engineering</td></tr>
    <tr><th>Team</th><td>Darshan P Pawar — SRN PES2UG24CS143<br/>Dhanush V Biradar — SRN PES2UG24CS155</td></tr>
    <tr><th>Database option</th><td>Option 2 — SQL (PostgreSQL 17) + Vector database (pgvector)</td></tr>
    <tr><th>Phase 2 scope</th><td>Phase 1 review and fixes · DML and seed data · vector search · advanced database features ·
      Next.js application with authentication and roles · security · testing · documentation</td></tr>
    <tr><th>Source code</th><td>https://github.com/Darshanpawar7/DBMS-Mini-Project</td></tr>
  </table>
  <div class="cover-stats">
    <div><b>12</b><span>tables</span></div>
    <div><b>34</b><span>indexes</span></div>
    <div><b>14</b><span>triggers</span></div>
    <div><b>15</b><span>functions &amp; procedures</span></div>
    <div><b>5</b><span>views (1 materialized)</span></div>
    <div><b>__TOTAL_TESTS__</b><span>passing tests</span></div>
  </div>
</section>
"""

PROBLEM = """
<h2 id="s1">1. Problem statement and motivation</h2>
<p>Students collect a large amount of material over a semester — lecture notes, PDFs, cheat sheets, past-paper
solutions — but it ends up scattered across Drive folders, WhatsApp groups and laptops. Every one of those tools
searches by <em>exact keywords or file names</em>. A student who wants "notes that explain how a model decides which
words matter" finds nothing unless someone happened to use those words; the note titled
<em>Transformers and Self-Attention Explained</em> stays invisible.</p>
<p>Finding study partners is just as ad hoc: students ask around in class groups, with no way to see who is actually
working on the same topics.</p>
<p><b>ScholarMesh</b> addresses both problems with one database design. Students upload notes; the text is split into
passages and turned into <em>embeddings</em> (lists of 384 numbers that capture meaning), so a question finds notes by
meaning, not by wording. The same embeddings, averaged over what each student uploads, saves and searches for, form an
<em>interest profile</em> that the database uses to recommend study groups and classmates. Course enrollment and a
three-level visibility rule (public / course-only / private) decide what anyone is allowed to see.</p>
<div class="callout"><b>Why this is more than CRUD.</b> Retrieval is by vector similarity and full-text ranking, not
<code>WHERE title LIKE …</code>; access control is enforced inside every query path by one database function; group
matching combines relational facts (enrollment, membership) with vector similarity; and business rules such as seat
limits and admin hand-over are enforced by triggers that also hold under concurrent requests.</div>
"""

OBJECTIVES = """
<h2 id="s2">2. Objectives</h2>
<ol>
  <li>Design a normalised relational schema for users, courses, notes, tags, study groups and activity, and evolve
      the Phase 1 design with <code>ALTER</code> where Phase 2 needs more.</li>
  <li>Store note embeddings in a vector store (pgvector) linked to the relational data with real foreign keys, and
      retrieve notes by cosine similarity through an HNSW index.</li>
  <li>Offer three search modes — keyword (full-text), semantic (vector) and hybrid (rank fusion) — that all respect
      the same access-control rule.</li>
  <li>Recommend study groups and partners from enrollment plus interest-vector similarity.</li>
  <li>Enforce data integrity in the database itself: constraints, triggers, transactions, row locks and a
      least-privilege application role.</li>
  <li>Provide a Next.js web application with authentication and two system roles (student, admin) that talks to the
      database only through a server-side API layer.</li>
  <li>Verify the result with automated unit, database-integration and end-to-end tests.</li>
</ol>
"""

SCOPE = """
<h2 id="s3">3. Scope</h2>
<div class="two-col">
<div>
<h3>In scope</h3>
<ul>
  <li>Registration, login, logout; roles <code>student</code> and <code>admin</code>; per-group roles <code>admin</code>/<code>member</code></li>
  <li>Uploading PDF, TXT and Markdown notes (or pasted text); text extraction; chunking; embedding</li>
  <li>Keyword, semantic and hybrid search with course/tag filters; search history</li>
  <li>Library browsing with filters, sorting and pagination; bookmarks; "more like this"</li>
  <li>Course enrollment; study groups (create, join, leave, manage members); recommendations</li>
  <li>Admin: analytics dashboard, user roles and deactivation, course catalogue, tag merging, audit log, embedding job</li>
</ul>
</div>
<div>
<h3>Out of scope</h3>
<ul>
  <li>Scanned PDFs (OCR) and images inside documents</li>
  <li>Real-time chat inside study groups; notifications by e-mail</li>
  <li>Password reset by e-mail and single sign-on</li>
  <li>Horizontal scaling (the login rate limiter and embedding model run in one server process)</li>
  <li><b>Verified enrollment.</b> Students enroll themselves, so "course-only" means "visible to anyone who enrolled in
      the course". In production <code>ENROLLMENT</code> would be synced from the university's student information
      system or protected by per-course join codes.</li>
</ul>
</div>
</div>
"""

REQUIREMENTS = """
<h2 id="s4">4. Users, roles and functional requirements</h2>
<p>Two <b>system roles</b> are stored in <code>STUDENT.role</code> (CHECK: <code>student</code> | <code>admin</code>).
Inside each study group a student additionally has a <b>group role</b> in <code>GROUP_MEMBERSHIP.role</code>
(<code>admin</code> | <code>member</code>). Self-registration always creates a student; only an admin can promote someone.</p>
<table class="grid">
<thead><tr><th>ID</th><th>Requirement</th><th>Role</th><th>Implemented by</th></tr></thead>
<tbody>
<tr><td>FR-1</td><td>Register, log in and log out; deactivated accounts cannot log in</td><td>All</td><td><code>/api/auth/*</code>, bcrypt, JWT cookie</td></tr>
<tr><td>FR-2</td><td>Upload a note (PDF/TXT/MD or pasted text) with title, course, visibility and tags</td><td>Student</td><td><code>POST /api/documents</code>, one transaction, trigger chunking</td></tr>
<tr><td>FR-3</td><td>Search by keyword, meaning or both, filtered by course and tag</td><td>Student, Admin</td><td><code>fn_keyword_search</code>, <code>fn_semantic_search</code>, <code>fn_hybrid_search</code></td></tr>
<tr><td>FR-4</td><td>Only see notes allowed by their visibility (public / enrolled course / own)</td><td>Student</td><td><code>fn_visible_doc_ids</code> in every listing and search</td></tr>
<tr><td>FR-5</td><td>Browse, filter, sort and paginate the library; bookmark notes; download files</td><td>Student</td><td><code>v_document_catalog</code>, <code>BOOKMARK</code></td></tr>
<tr><td>FR-6</td><td>Edit or delete own notes</td><td>Owner, Admin</td><td><code>PATCH/DELETE /api/documents/:id</code></td></tr>
<tr><td>FR-7</td><td>Enroll in / drop courses (dropping leaves that course's groups)</td><td>Student</td><td><code>ENROLLMENT</code>, trigger T10</td></tr>
<tr><td>FR-8</td><td>Create a group for an enrolled course; the creator becomes group admin</td><td>Student</td><td>trigger T6 + T5</td></tr>
<tr><td>FR-9</td><td>Join / leave groups; seat limit and enrollment enforced, also under concurrency</td><td>Student</td><td><code>sp_join_group</code>, <code>sp_leave_group</code>, trigger T5 (row lock)</td></tr>
<tr><td>FR-10</td><td>Group admins promote/demote/remove members; a group never loses its last admin</td><td>Group admin</td><td>triggers T7, T8</td></tr>
<tr><td>FR-11</td><td>Recommended groups and classmates ranked by interest similarity</td><td>Student</td><td><code>fn_recommend_groups</code>, <code>fn_recommend_partners</code></td></tr>
<tr><td>FR-12</td><td>Dashboard: personal statistics, new notes in my courses, trending topics, recent searches</td><td>Student</td><td><code>fn_student_stats</code>, GROUP BY/HAVING queries</td></tr>
<tr><td>FR-13</td><td>Platform analytics: totals, searches per day, popular questions, content gaps, top contributors</td><td>Admin</td><td>aggregates, window functions, <code>mv_course_engagement</code></td></tr>
<tr><td>FR-14</td><td>Change roles, deactivate or delete users (not themselves)</td><td>Admin</td><td><code>/api/admin/users/:id</code>, audited</td></tr>
<tr><td>FR-15</td><td>Manage courses; merge duplicate tags</td><td>Admin</td><td><code>/api/admin/courses</code>, <code>sp_merge_tags</code></td></tr>
<tr><td>FR-16</td><td>See an audit trail of sensitive changes with the acting user</td><td>Admin</td><td>trigger T11 → <code>AUDIT_LOG</code></td></tr>
<tr><td>FR-17</td><td>Re-run the embedding job and refresh analytics</td><td>Admin</td><td><code>/api/admin/embeddings</code>, <code>fn_refresh_course_stats</code></td></tr>
</tbody></table>
"""

PHASE1_REVIEW = """
<h2 id="s5">5. Phase 1 review — issues found and fixed</h2>
<p>The Week-4 schema was re-checked before building on it. Each fix is marked <code>FIX n</code> in
<code>db/01_schema.sql</code> or implemented through <code>ALTER</code> in <code>db/02_phase2_alter.sql</code>.</p>
<table class="grid">
<thead><tr><th>#</th><th>Issue in Phase 1</th><th>Why it matters</th><th>Fix</th></tr></thead>
<tbody>
<tr><td>1</td><td><code>idx_tag_name</code> on <code>TAG(tag_name)</code></td><td><code>UNIQUE</code> already builds that index, so every insert maintained two identical indexes</td><td>Removed</td></tr>
<tr><td>2</td><td>No index on the second column of composite keys (<code>ENROLLMENT.course_id</code>, <code>DOCUMENT_TAG.tag_id</code>, <code>BOOKMARK.doc_id</code>, <code>GROUP_MEMBERSHIP.student_id</code>)</td><td>"Which groups is this student in?" and "which notes have this tag?" were full table scans</td><td>Four indexes added (+ <code>STUDY_GROUP.created_by</code>)</td></tr>
<tr><td>3</td><td><code>idx_document_visibility</code></td><td>Only three distinct values, so the planner would never use it</td><td>Replaced by composite <code>(course_id, visibility)</code> matching the access rule, plus a partial index on public notes</td></tr>
<tr><td>4</td><td>No system role column</td><td>The brief needs at least two roles; the schema could not express an admin</td><td><code>ALTER TABLE STUDENT ADD role, is_active, last_login_at</code></td></tr>
<tr><td>5</td><td><code>DOCUMENT.vector_id</code> — a free-text pointer into an external vector store</td><td>Nothing stopped it from pointing at a vector that no longer exists; one vector per document is too coarse for good retrieval</td><td>Dropped; embeddings now live in <code>DOC_CHUNK</code> (weak entity) with a real foreign key, one vector per passage</td></tr>
<tr><td>6</td><td><code>STUDY_GROUP.created_by … ON DELETE CASCADE</code></td><td>If the creator deleted their account, the whole group disappeared for every other member</td><td><code>ON DELETE SET NULL</code>; a trigger hands the admin role to the longest-standing member</td></tr>
<tr><td>7</td><td>E-mail uniqueness was case-sensitive</td><td><code>Ana@x.com</code> and <code>ana@x.com</code> could be two accounts</td><td>Unique index on <code>LOWER(email)</code> + normalising trigger</td></tr>
<tr><td>8</td><td><code>max_members</code> never enforced; group creator not guaranteed to be a member</td><td>Groups could be overfilled; groups could exist without an admin</td><td>Triggers T5–T9 (seat limit with row lock, creator becomes admin, succession)</td></tr>
<tr><td>9</td><td><code>TIMESTAMP</code> without time zone</td><td>Ambiguous instants once the server and users are in different zones</td><td><code>TIMESTAMPTZ</code> everywhere</td></tr>
<tr><td>10</td><td>Few validation rules (only year, visibility, role CHECKs)</td><td>The brief requires validation at the database level</td><td>22 new CHECK constraints — 25 in total (e-mail format, bcrypt-only passwords, semester format, tag format, sizes …)</td></tr>
<tr><td>11</td><td>ER diagram drew the relationship attribute <code>semester</code> as a rectangle</td><td>In Chen notation rectangles are entities</td><td>Redrawn as an attribute oval (Figure 1)</td></tr>
</tbody></table>
"""

JUSTIFICATION = """
<h2 id="s8">8. Database choice and justification</h2>
<table class="grid">
<thead><tr><th>Data</th><th>Stored in</th><th>Why</th></tr></thead>
<tbody>
<tr><td>Users, courses, enrollments, groups, memberships, bookmarks, tags, search history, audit trail</td><td>PostgreSQL tables</td>
<td>Highly structured with many relationships; integrity matters (a membership must reference a real student, group and
enrollment); needs transactions and row locks (two students joining the last seat).</td></tr>
<tr><td>Note text and its full-text index</td><td>PostgreSQL <code>TEXT</code> + generated <code>tsvector</code> + GIN</td>
<td>Exact-term search with stemming and ranking, kept in sync automatically by a generated column.</td></tr>
<tr><td>Passage embeddings, query embeddings</td><td>pgvector <code>vector(384)</code> + HNSW index</td>
<td>Notes are unstructured; meaning-based retrieval needs nearest-neighbour search over vectors, which a B-tree cannot do.</td></tr>
</tbody></table>
<h3>Why pgvector rather than a separate vector database</h3>
<ul>
<li><b>One query can combine both paradigms.</b> The access rule (enrollment, visibility, ownership) and the vector
ranking run in the same SQL statement, so a private note can never "leak" through the vector store. With an external
store the app would have to fetch nearest neighbours first and filter afterwards.</li>
<li><b>Real referential integrity.</b> <code>DOC_CHUNK.doc_id</code> is a foreign key with <code>ON DELETE CASCADE</code>;
deleting a note deletes its vectors in the same transaction. Phase 1's string pointer could dangle.</li>
<li><b>Transactions span both.</b> Re-chunking after an edit and marking the document <code>pending</code> happen atomically.</li>
<li><b>Vectors become SQL values.</b> <code>AVG(embedding)</code> builds document centroids and student interest
vectors inside views — the basis of group matching.</li>
<li><b>Operationally simple.</b> One Docker container, one backup, one connection pool.</li>
</ul>
<p>The trade-off is scale: a dedicated vector database is better beyond tens of millions of vectors. For a university's
notes (thousands of documents) PostgreSQL with HNSW answers in milliseconds.</p>
"""

VECTOR = """
<h2 id="s11">11. Vector database and semantic search</h2>
<table class="grid">
<tbody>
<tr><th>What is embedded</th><td>(a) every <b>passage</b> of every note — the text is split by trigger T4 using
<code>fn_chunk_text</code> into chunks of at most 800 characters (paragraphs kept together, long paragraphs split on
sentence boundaries); (b) every <b>search query</b>, stored in <code>SEARCH_LOG.query_embedding</code> for interest profiles.</td></tr>
<tr><th>Model</th><td><code>sentence-transformers/all-MiniLM-L6-v2</code> (ONNX, 8-bit quantised), run locally in Node.js with
Transformers.js — no API key and no note text leaves the server. Mean pooling + L2 normalisation → 384-dimensional unit vectors.
Chosen after comparing three 384-d models on sample questions: it gave the clearest gap between relevant and unrelated notes.</td></tr>
<tr><th>Storage</th><td><code>DOC_CHUNK.embedding vector(384)</code> (pgvector), <code>NULL</code> until the embedding worker fills it;
<code>DOCUMENT.embedding_status</code> tracks <code>pending → ready</code> (or <code>failed</code>).</td></tr>
<tr><th>Index</th><td><code>HNSW (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)</code> — a navigable graph that finds
approximate nearest neighbours without scanning every vector (EXPLAIN in §13, Q16).</td></tr>
<tr><th>Similarity metric</th><td>Cosine distance, operator <code>&lt;=&gt;</code>; the app reports <i>similarity = 1 − distance</i>.</td></tr>
<tr><th>Retrieval</th><td><code>fn_semantic_search</code>: take the nearest passages among documents the student may see, keep the best passage per
document, drop matches below 0.28 similarity, return the passage as the snippet.</td></tr>
</tbody></table>

<h3>Choosing the similarity cut-off</h3>
<p>The threshold was measured, not guessed. Off-topic questions never scored above 0.27 while relevant notes scored 0.38+:</p>
<table class="grid compact">
<thead><tr><th>Question</th><th>Best similarity</th><th>Best note</th><th>Returned at 0.28?</th></tr></thead>
<tbody>
<tr><td>what happens when i type a url</td><td>0.52</td><td>What Happens During a DNS Lookup</td><td>yes</td></tr>
<tr><td>how do models decide which words matter</td><td>0.51</td><td>Word Embeddings: word2vec and GloVe</td><td>yes</td></tr>
<tr><td>how to stop overfitting</td><td>0.45</td><td>Bias-Variance Trade-off and Regularization</td><td>yes</td></tr>
<tr><td>why does my table have duplicate data</td><td>0.38</td><td>Transactions, ACID … / Normalization</td><td>yes</td></tr>
<tr><td>quantum computing basics</td><td>0.27</td><td>(unrelated)</td><td>no → logged as a content gap</td></tr>
<tr><td>agile sprint planning</td><td>0.23</td><td>(unrelated)</td><td>no</td></tr>
<tr><td>photosynthesis in plants</td><td>0.19</td><td>(unrelated)</td><td>no</td></tr>
</tbody></table>

<h3>Hybrid search — Reciprocal Rank Fusion</h3>
<p>Keyword search is precise for exact terms ("BCNF"); semantic search understands paraphrases. <code>fn_hybrid_search</code>
runs both and merges them with <b>Reciprocal Rank Fusion</b>: <code>score = 1/(60 + keyword_rank) + 1/(60 + semantic_rank)</code>
(a missing rank contributes 0). A note found by both methods rises to the top; a note found by only one still appears.
Example: <i>"bcnf decomposition"</i> returns nothing in keyword mode (no note contains "decomposition") but the normalization
note in semantic and hybrid mode (Figures 5–6).</p>

<h3>Interest profiles and study-group matching</h3>
<p><code>v_doc_centroid</code> averages each document's passage vectors. <code>v_student_interest</code> averages, per student, the
centroids of notes they uploaded or bookmarked and the vectors of their searches from the last 120 days. A group's interest is
the average of its members' interest vectors. <code>fn_recommend_groups</code> considers only groups in the student's
courses that still have a seat and ranks them by</p>
<p class="formula">match = 0.7 × cosine(student interest, group interest) + 0.3 × Jaccard(student topics, group topics)</p>
<p>where "topics" are the tags of notes each person uploaded or bookmarked <i>within that group's course</i>.
<code>fn_recommend_partners</code> ranks classmates (students sharing a course) by interest similarity.</p>

<h3>Embedding pipeline</h3>
<ol>
<li>Upload: one transaction inserts the <code>DOCUMENT</code>; trigger T4 writes its <code>DOC_CHUNK</code> rows (no vectors yet); tags are linked.</li>
<li>After commit the API embeds the new chunks in one batch and writes them with a single set-based <code>UPDATE … FROM unnest(…)</code>; the document becomes <code>ready</code>.</li>
<li>If the model is unavailable the note is still saved and keyword-searchable (<code>failed</code>); an admin re-runs the job later. Editing the text re-chunks it and resets it to <code>pending</code>.</li>
</ol>
"""

CONCLUSION = """
<h2 id="s19">19. Conclusion and future enhancements</h2>
<p>ScholarMesh shows how one PostgreSQL database can serve two paradigms at once: a strictly validated relational model
for people, courses, groups and activity, and a vector store for meaning-based retrieval — joined in single SQL statements
so that access control, ranking and integrity are guaranteed by the database rather than by application code. Phase 1's
design was corrected (redundant and missing indexes, a dangling vector pointer, a destructive cascade, missing roles and
rules) and extended with chunk-level embeddings, full-text search, views, a materialized view, stored functions and
procedures, triggers, an audit trail and a least-privilege application role. A Next.js application exposes all of it
through a validated API, and __TOTAL_TESTS__ automated tests confirm the behaviour, including real races for the last seat in a group and for leaving one.</p>
<h3>Future enhancements</h3>
<ul>
<li><b>OCR</b> for scanned PDFs and handwritten notes; image and diagram embeddings.</li>
<li><b>Verified enrollment</b> — sync <code>ENROLLMENT</code> from the university system, or require a per-course join code.</li>
<li><b>Row-Level Security</b> policies so the access rule is enforced even for ad-hoc SQL, not only through the functions.</li>
<li><b>Background job queue</b> (e.g. a worker table polled with <code>SELECT … FOR UPDATE SKIP LOCKED</code>) for large uploads.</li>
<li><b>Re-ranking</b> the top hybrid results with a cross-encoder; per-course embedding fine-tuning.</li>
<li><b>Notifications</b> when a recommended group has a free seat; meeting scheduling inside groups.</li>
<li><b>Table partitioning</b> of <code>SEARCH_LOG</code> and <code>AUDIT_LOG</code> by month as they grow; a Redis-backed rate limiter for multiple servers.</li>
</ul>
"""

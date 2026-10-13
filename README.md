# DBMS Mini Project — ScholarMesh

**Semantic research-notes discovery and study-group matchmaking.** Students upload notes, search them
by *meaning* rather than by filename, and get matched with study groups and classmates who are studying
the same ideas.

DBMS Level 3 mini project, PES University (EC Campus), Dept. of CSE. Database option: **SQL + vector database**
(PostgreSQL 17 + pgvector).

**Team:** Darshan P Pawar (PES2UG24CS143) · Dhanush V Biradar (PES2UG24CS155)

| Layer | Technology |
| --- | --- |
| Relational database | PostgreSQL 17 (Docker) — 12 tables, views, a materialized view, 14 triggers, 12 functions, 3 procedures |
| Vector database | pgvector — 384-d embeddings, HNSW index, cosine distance |
| Full-text search | generated `tsvector` column + GIN index |
| Embeddings | `all-MiniLM-L6-v2` run locally with Transformers.js (no API key) |
| Web app + API | Next.js 16 (App Router, Route Handlers), React 19, Tailwind CSS 4 |
| Auth | bcrypt password hashes, signed JWT in an httpOnly cookie, roles `student` / `admin` |
| Tests | Vitest (unit + database integration), Playwright (end-to-end) |

The full write-up (ER diagram, schema, data dictionary, queries, screenshots, test results) is in
[`docs/ScholarMesh_Phase2_Report.pdf`](docs/ScholarMesh_Phase2_Report.pdf).

---

## Project layout

```
db/                         SQL, run in this order by `npm run db:setup`
  01_schema.sql             Phase 1 DDL (corrected; fixes marked FIX 1-7)
  02_phase2_alter.sql       Phase 2 changes: ALTER/ADD/DROP, pgvector, DOC_CHUNK, AUDIT_LOG, indexes
  03_views.sql              views + materialized view
  04_functions.sql          access control, search (keyword/semantic/hybrid), matching, procedures
  05_triggers.sql           business rules enforced by the database
  06_security.sql           grants for the least-privilege app role
  07_seed_core.sql …        demo data (courses, 17 users, 33 notes, groups, bookmarks, searches)
  09_seed_activity.sql
  10_important_queries.sql  demonstration queries (not run by setup)
web/                        Next.js application
  src/app/                  pages and /api route handlers
  src/lib/repos/            all SQL used by the app (parameterised)
  scripts/                  db-setup, embedding worker, screenshots, report rendering
  tests/                    unit/, db/ (integration), e2e/ (Playwright)
docs/                       report (PDF + sources), ER and architecture diagrams, screenshots
docker-compose.yml          PostgreSQL 17 + pgvector
```

---

## Run it locally

Repository: [github.com/Darshanpawar7/DBMS-Mini-Project](https://github.com/Darshanpawar7/DBMS-Mini-Project)

```bash
git clone https://github.com/Darshanpawar7/DBMS-Mini-Project.git
cd DBMS-Mini-Project
```

**You need:** Docker Desktop, Node.js 20 or newer (tested on 24), and internet for the first run
(Docker image, npm packages and a 23 MB embedding model).

```bash
# 1. Database settings (root folder). Pick your own passwords.
cp .env.example .env

# 2. Start PostgreSQL + pgvector on port 5433
docker compose up -d

# 3. App settings
cd web
cp .env.example .env.local
#    - DATABASE_URL: use the same password as APP_DB_PASSWORD in ../.env
#    - AUTH_SECRET:  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 4. Install, build the database, compute the embeddings
npm install
npm run db:setup      # schema, functions, triggers, grants, demo data (re-run any time to reset)
npm run db:embed      # embeds every passage and logged query (first run downloads the model)

# 5. Start the app
npm run dev           # http://localhost:3000
```

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@scholarmesh.test` | `Admin@12345` |
| Student | `ananya.rao@scholarmesh.test` | `Scholar@123` |
| Student | any other seeded student, e.g. `rahul.verma@scholarmesh.test` | `Scholar@123` |

Only bcrypt hashes are stored in the database; these demo passwords exist only in this README.

### Things to try

- **Search → Semantic**, ask *"how do models decide which words matter"* — the transformer and word-embedding
  notes come back although they share no keywords with the question.
- Search *"bcnf decomposition"* in **Keyword** mode (no results), then in **Semantic** mode (finds the normalization note).
- **Study groups → Query Optimizers → Join**: the group is full, and the database trigger refuses the seat.
- Log in as the admin: analytics, the materialized-view refresh, the embedding job, role changes and the audit log.

---

## Tests

```bash
cd web
npm test              # 80 unit + database integration tests (needs the database running)
npm run test:e2e      # 10 Playwright browser tests (starts the dev server on port 3100 if needed)
npm run typecheck     # TypeScript
npm run lint          # ESLint
```

The database tests run inside transactions that are rolled back, so they leave the data unchanged.
First-time Playwright users: `npx playwright install chromium`.

## Useful database commands

```bash
# open psql inside the container
docker exec -it scholarmesh-db psql -U postgres -d scholarmesh

# run the demonstration queries (joins, GROUP BY/HAVING, subqueries, window functions,
# transactions, full-text and vector search, EXPLAIN ANALYZE)
docker exec -i scholarmesh-db psql -U postgres -d scholarmesh < db/10_important_queries.sql
```

## Security notes

- No credentials in source code: Docker reads `.env`, the app reads `web/.env.local` (both git-ignored).
- The app connects as `scholarmesh_app`, which can read/write rows but cannot create, alter or drop
  objects, and can only append to `AUDIT_LOG`.
- Every query is parameterised; inputs are validated with zod in the API **and** by CHECK constraints in the database.
- Passwords are bcrypt-hashed (a CHECK constraint rejects anything that is not a bcrypt hash).
- httpOnly + SameSite cookies, same-origin check on every mutation, per-account login rate limiting
  (per-IP too when `TRUST_PROXY=true` behind a reverse proxy), upload size/page/rate limits, security headers.
- PostgreSQL is published on `127.0.0.1` only.
- Known limitation: students enroll themselves, so "course-only" notes are visible to anyone who enrolls in
  that course. A production deployment would sync enrollments from the university system or use join codes.

## Team

| Member | SRN | Responsibilities |
| --- | --- | --- |
| Darshan P Pawar | PES2UG24CS143 | Notes & search: Phase 1 design and fixes, Phase 2 schema, pgvector, chunking, keyword/semantic/hybrid search, seed data, upload and search UI, report |
| Dhanush V Biradar | PES2UG24CS155 | People, groups & admin: views, group triggers and procedures, recommendations, audit and grants, important queries, auth and API layer, group/admin pages, tests |

Each member commits their own work from their own GitHub account so the history shows individual
contributions (one feature branch per area, merged through pull requests).

# ScholarMesh — demo video script

Video: `ScholarMesh_Demo.mp4` (4:46, 1920×1080, chapters included).
Use this as a narration guide: each line is what the caption on screen says at that moment.


## 0:00 — Introduction

- **0:15** A shared library for the semester: upload notes, search them by meaning, and get matched into study groups.
- **0:24** Passwords are stored only as bcrypt hashes — a CHECK constraint in the database rejects anything else.

## 0:32 — Student dashboard

- **0:32** Everything here is computed live by SQL: my numbers come from one stored function, fn_student_stats.
- **0:38** Study groups are ranked by how close their members' interests are to mine — vector similarity computed inside PostgreSQL.
- **0:45** Plus new notes from my courses, trending topics (GROUP BY … HAVING) and my recent searches.

## 0:51 — 1 · Search by meaning

- **0:59** First, classic keyword search: PostgreSQL full-text search with a GIN index.
- **1:06** 0 results — no note contains the word “decomposition”, even though one explains exactly this.
- **1:11** Now semantic search: the question becomes 384 numbers (an embedding), and pgvector finds the closest note passages.
- **1:19** Found the Normalization note by meaning — with an HNSW index and cosine similarity.
- **1:24** Hybrid runs both searches and merges the rankings (Reciprocal Rank Fusion).
- **1:34** Every search goes through one database function, fn_visible_doc_ids — private notes never leak into results.
- **1:40** Each note keeps its passages and their embeddings in the DOC_CHUNK table.
- **1:45** Similar notes = the nearest document centroids (the average of each note's passage vectors).
- **1:53** Saving a note is a row in the BOOKMARK table — and a signal for my interest profile.

## 1:59 — 2 · Upload a note

- **2:06** The library lists only notes I'm allowed to see — public, my courses, and my own.
- **2:12** PDF, TXT or Markdown — or paste text. Here I paste my notes on crash recovery.
- **2:26** One transaction: insert the note, a trigger splits it into passages, tags are linked. If anything fails, nothing is saved.
- **2:33** Done: the passages were embedded by the local AI model right after the save.
- **2:40** Ask in different words — no shared keywords with the title.
- **2:47** The new note comes back first — searchable by meaning seconds after uploading.

## 2:53 — 3 · Study groups

- **3:00** Match = 70% interest-vector similarity + 30% shared topic tags, only for groups in my courses with a free seat.
- **3:07** Query Optimizers already has 4 of 4 members. What if I try to join anyway?
- **3:13** The database refuses: a trigger locks the group row and checks the seat limit — even if two people click at the same moment.
- **3:22** Joining a group with a free seat calls the stored procedure sp_join_group.

## 3:30 — 4 · Admin & audit

- **3:37** Logging in as the admin — a second role, checked against the database on every request.
- **3:44** Searches per day by mode — one query with COUNT(*) FILTER over a generated calendar.
- **3:51** Course engagement is a materialized view, refreshed on demand through a SECURITY DEFINER function.
- **3:59** Questions that never found a note (HAVING MAX(result_count) = 0) — topics students need notes for.
- **4:08** Written only by triggers, with who did it — here, Darshan's upload. The app's database login can add to this log but never edit it.

## 4:16 — Under the hood


## 4:37 — Summary


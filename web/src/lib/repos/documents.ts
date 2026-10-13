import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { DocumentCard, Visibility } from "@/lib/types";

export const PAGE_SIZE = 12;

export interface DocumentFilters {
  q?: string;
  course: number | null;
  tag?: string;
  scope: "all" | "mine" | "bookmarked";
  sort: "recent" | "popular" | "title";
  page: number;
}

/** Escape LIKE wildcards so user text is matched literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Library listing: only documents the viewer may see (fn_visible_doc_ids), filtered, sorted, paginated. */
export async function listDocuments(viewerId: number, f: DocumentFilters): Promise<{ items: DocumentCard[]; total: number }> {
  const rows = await query<DocumentCard & { total: number }>(
    `SELECT c.*, COUNT(*) OVER()::INT AS total
     FROM v_document_catalog c
     JOIN fn_visible_doc_ids($1) v ON v.doc_id = c.doc_id
     WHERE ($2::INT IS NULL OR c.course_id = $2)
       AND ($3::VARCHAR IS NULL OR $3::VARCHAR = ANY (c.tags))
       AND ($4::TEXT IS NULL OR c.title ILIKE $4 OR c.description ILIKE $4)
       AND ($5::TEXT <> 'mine' OR c.owner_id = $1)
       AND ($5::TEXT <> 'bookmarked' OR EXISTS (
              SELECT 1 FROM BOOKMARK b WHERE b.doc_id = c.doc_id AND b.student_id = $1))
     ORDER BY CASE WHEN $6::TEXT = 'popular' THEN c.bookmark_count END DESC NULLS LAST,
              CASE WHEN $6::TEXT = 'title' THEN c.title END ASC,
              c.upload_date DESC
     LIMIT $7 OFFSET $8`,
    [
      viewerId,
      f.course,
      f.tag ?? null,
      f.q ? likePattern(f.q) : null,
      f.scope,
      f.sort,
      PAGE_SIZE,
      (f.page - 1) * PAGE_SIZE,
    ],
  );
  const total = rows[0]?.total ?? 0;
  const items = rows.map((row) => {
    const card: DocumentCard & { total?: number } = { ...row };
    delete card.total;
    return card;
  });
  return { items, total };
}

export interface DocumentDetail extends DocumentCard {
  content: string | null;
  file_path: string;
  updated_at: string;
  is_bookmarked: boolean;
}

/** Returns null when the document does not exist OR the viewer may not see it (no existence leak). */
export function getDocumentForViewer(viewerId: number, docId: number): Promise<DocumentDetail | null> {
  return queryOne<DocumentDetail>(
    `SELECT c.*, d.content, d.file_path, d.updated_at,
            EXISTS (SELECT 1 FROM BOOKMARK b WHERE b.doc_id = d.doc_id AND b.student_id = $1) AS is_bookmarked
     FROM v_document_catalog c
     JOIN DOCUMENT d ON d.doc_id = c.doc_id
     WHERE c.doc_id = $2 AND fn_can_view_document($1, $2)`,
    [viewerId, docId],
  );
}

export interface DocumentMeta {
  title: string;
  description: string | null;
  visibility: Visibility;
  course_id: number | null;
  tags: string[];
}

async function replaceTags(client: PoolClient, docId: number, tags: string[]): Promise<void> {
  await client.query("DELETE FROM DOCUMENT_TAG WHERE doc_id = $1", [docId]);
  if (tags.length === 0) return;
  // upsert the tag vocabulary, then link -- trg_tag_normalize cleans each name
  await client.query("INSERT INTO TAG (tag_name) SELECT unnest($1::VARCHAR[]) ON CONFLICT (tag_name) DO NOTHING", [tags]);
  await client.query(
    `INSERT INTO DOCUMENT_TAG (doc_id, tag_id)
     SELECT $1, tag_id FROM TAG WHERE tag_name = ANY ($2::VARCHAR[])
     ON CONFLICT DO NOTHING`,
    [docId, tags],
  );
}

export interface NewDocument extends DocumentMeta {
  file_path: string;
  file_type: "pdf" | "txt" | "md";
  file_size_bytes: number;
  content: string;
}

/**
 * One transaction: DOCUMENT row (trigger T4 splits it into DOC_CHUNK rows),
 * tag upserts and DOCUMENT_TAG links. Either everything is saved or nothing.
 */
export async function createDocument(ownerId: number, doc: NewDocument): Promise<number> {
  return withTransaction(
    async (client) => {
      const { rows } = await client.query<{ doc_id: number }>(
        `INSERT INTO DOCUMENT (title, description, file_path, file_type, file_size_bytes, visibility, content, student_id, course_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING doc_id`,
        [doc.title, doc.description, doc.file_path, doc.file_type, doc.file_size_bytes, doc.visibility, doc.content, ownerId, doc.course_id],
      );
      const docId = rows[0].doc_id;
      await replaceTags(client, docId, doc.tags);
      return docId;
    },
    { actorId: ownerId },
  );
}

async function assertCanEdit(client: PoolClient, actorId: number, isAdmin: boolean, docId: number): Promise<{ file_path: string }> {
  const { rows } = await client.query<{ student_id: number; file_path: string }>(
    "SELECT student_id, file_path FROM DOCUMENT WHERE doc_id = $1 FOR UPDATE",
    [docId],
  );
  const row = rows[0];
  if (!row) throw new ApiError(404, "Document not found");
  if (row.student_id !== actorId && !isAdmin) throw new ApiError(403, "Only the owner or an admin can change this document");
  return row;
}

export async function updateDocument(actorId: number, isAdmin: boolean, docId: number, meta: DocumentMeta): Promise<void> {
  await withTransaction(
    async (client) => {
      await assertCanEdit(client, actorId, isAdmin, docId);
      await client.query(
        `UPDATE DOCUMENT SET title = $2, description = $3, visibility = $4, course_id = $5 WHERE doc_id = $1`,
        [docId, meta.title, meta.description, meta.visibility, meta.course_id],
      );
      await replaceTags(client, docId, meta.tags);
    },
    { actorId },
  );
}

/** Deletes the row (chunks, tags, bookmarks cascade) and returns the stored file name for clean-up. */
export async function deleteDocument(actorId: number, isAdmin: boolean, docId: number): Promise<string> {
  return withTransaction(
    async (client) => {
      const { file_path } = await assertCanEdit(client, actorId, isAdmin, docId);
      await client.query("DELETE FROM DOCUMENT WHERE doc_id = $1", [docId]);
      return file_path;
    },
    { actorId },
  );
}

export async function setBookmark(studentId: number, docId: number, bookmarked: boolean): Promise<void> {
  if (!bookmarked) {
    await query("DELETE FROM BOOKMARK WHERE student_id = $1 AND doc_id = $2", [studentId, docId]);
    return;
  }
  // INSERT ... SELECT only inserts when the student is allowed to see the document
  const rows = await query(
    `INSERT INTO BOOKMARK (student_id, doc_id)
     SELECT $1, $2 WHERE fn_can_view_document($1, $2)
     ON CONFLICT DO NOTHING
     RETURNING doc_id`,
    [studentId, docId],
  );
  if (rows.length === 0) {
    const exists = await queryOne("SELECT 1 FROM BOOKMARK WHERE student_id = $1 AND doc_id = $2", [studentId, docId]);
    if (!exists) throw new ApiError(404, "Document not found");
  }
}

export interface SimilarDocument {
  doc_id: number;
  title: string;
  course_code: string | null;
  owner_name: string;
  similarity: number;
}

export function similarDocuments(viewerId: number, docId: number): Promise<SimilarDocument[]> {
  return query<SimilarDocument>(
    `SELECT s.doc_id, c.title, c.course_code, c.owner_name, s.similarity
     FROM fn_similar_documents($1, $2, 5) s
     JOIN v_document_catalog c ON c.doc_id = s.doc_id
     ORDER BY s.similarity DESC`,
    [viewerId, docId],
  );
}

export interface TagCount {
  tag_name: string;
  documents: number;
}

/** Tag vocabulary with usage counts (GROUP BY ... HAVING). */
export function listTags(minDocuments = 1): Promise<TagCount[]> {
  return query<TagCount>(
    `SELECT t.tag_name, COUNT(dt.doc_id)::INT AS documents
     FROM TAG t
     LEFT JOIN DOCUMENT_TAG dt ON dt.tag_id = t.tag_id
     GROUP BY t.tag_id
     HAVING COUNT(dt.doc_id) >= $1
     ORDER BY documents DESC, t.tag_name`,
    [minDocuments],
  );
}

/** Admin clean-up: CALL sp_merge_tags -- re-points documents, then drops the old tag, atomically. */
export async function mergeTags(actorId: number, from: string, into: string): Promise<void> {
  await withTransaction((client) => client.query("CALL sp_merge_tags($1, $2)", [from, into]), { actorId });
}

import { query, toVectorLiteral } from "@/lib/db";
import { embedQuery } from "@/lib/embeddings";
import type { SearchHit, SearchMode } from "@/lib/types";

const RESULT_LIMIT = 20;
const SEMANTIC_MIN_SIMILARITY = 0.28;

export interface SearchRequest {
  q: string;
  mode: SearchMode;
  course: number | null;
  tag: string | null;
}

export interface SearchResponse {
  mode: SearchMode;
  hits: SearchHit[];
  tookMs: number;
}

// Each mode is a stored function (db/04_functions.sql); all of them apply the
// same access-control scope, so results never include documents the viewer
// is not allowed to open. Each mode binds exactly the parameters it uses.
function buildQuery(mode: SearchMode, studentId: number, req: SearchRequest, vector: string | null): { sql: string; params: unknown[] } {
  switch (mode) {
    case "keyword":
      return {
        sql: `SELECT c.*, k.rank AS score, NULL::REAL AS similarity,
                     ROW_NUMBER() OVER (ORDER BY k.rank DESC)::INT AS keyword_rank, NULL::INT AS semantic_rank, k.snippet
              FROM fn_keyword_search($1, $2, ${RESULT_LIMIT}, $3, $4) k
              JOIN v_document_catalog c ON c.doc_id = k.doc_id
              ORDER BY k.rank DESC`,
        params: [studentId, req.q, req.course, req.tag],
      };
    case "semantic":
      return {
        sql: `SELECT c.*, s.similarity AS score, s.similarity,
                     NULL::INT AS keyword_rank, ROW_NUMBER() OVER (ORDER BY s.similarity DESC)::INT AS semantic_rank, s.snippet
              FROM fn_semantic_search($1, $2::vector, ${RESULT_LIMIT}, ${SEMANTIC_MIN_SIMILARITY}, $3, $4) s
              JOIN v_document_catalog c ON c.doc_id = s.doc_id
              ORDER BY s.similarity DESC`,
        params: [studentId, vector, req.course, req.tag],
      };
    case "hybrid":
      return {
        sql: `SELECT c.*, h.score, h.similarity, h.keyword_rank, h.semantic_rank, h.snippet
              FROM fn_hybrid_search($1, $2, $3::vector, ${RESULT_LIMIT}, $4, $5) h
              JOIN v_document_catalog c ON c.doc_id = h.doc_id
              ORDER BY h.score DESC`,
        params: [studentId, req.q, vector, req.course, req.tag],
      };
  }
}

async function safeEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedQuery(text);
  } catch (error) {
    console.error("[search] embedding model unavailable", error);
    return null;
  }
}

export async function runSearch(studentId: number, req: SearchRequest): Promise<SearchResponse> {
  const started = performance.now();
  const vector = await safeEmbed(req.q);
  // without a model, fall back to keyword search rather than failing
  const mode: SearchMode = vector ? req.mode : "keyword";
  const vectorLiteral = vector ? toVectorLiteral(vector) : null;

  const { sql, params } = buildQuery(mode, studentId, req, vectorLiteral);
  const hits = await query<SearchHit>(sql, params);

  // every search is logged; the query vector feeds the student's interest profile
  await query(
    `INSERT INTO SEARCH_LOG (query_text, student_id, search_mode, result_count, query_embedding)
     VALUES ($1, $2, $3, $4, $5::vector)`,
    [req.q, studentId, mode, hits.length, vectorLiteral],
  );

  return { mode, hits, tookMs: Math.round(performance.now() - started) };
}

export interface RecentSearch {
  query_text: string;
  search_mode: SearchMode;
  result_count: number | null;
  searched_at: string;
}

export function recentSearches(studentId: number, limit = 6): Promise<RecentSearch[]> {
  return query<RecentSearch>(
    `SELECT * FROM (
       SELECT DISTINCT ON (LOWER(query_text)) query_text, search_mode, result_count, searched_at
       FROM SEARCH_LOG
       WHERE student_id = $1
       ORDER BY LOWER(query_text), searched_at DESC
     ) latest
     ORDER BY searched_at DESC
     LIMIT $2`,
    [studentId, limit],
  );
}

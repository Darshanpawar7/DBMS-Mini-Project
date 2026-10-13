import { query, queryOne } from "@/lib/db";
import type { DocumentCard } from "@/lib/types";

// ------------------------------------------------------------ student dashboard

export interface StudentStats {
  my_documents: number;
  my_bookmarks: number;
  my_groups: number;
  my_courses: number;
  searches_30d: number;
  bookmarks_received: number;
}

export async function studentStats(studentId: number): Promise<StudentStats> {
  const row = await queryOne<StudentStats>("SELECT * FROM fn_student_stats($1)", [studentId]);
  return row ?? { my_documents: 0, my_bookmarks: 0, my_groups: 0, my_courses: 0, searches_30d: 0, bookmarks_received: 0 };
}

/** New notes from classmates in my courses: visible to me and not my own. */
export function recentFeed(studentId: number, limit = 6): Promise<DocumentCard[]> {
  return query<DocumentCard>(
    `SELECT c.*
     FROM v_document_catalog c
     JOIN fn_visible_doc_ids($1) v ON v.doc_id = c.doc_id
     WHERE c.owner_id <> $1
       AND c.course_id IN (SELECT course_id FROM ENROLLMENT WHERE student_id = $1)
     ORDER BY c.upload_date DESC
     LIMIT $2`,
    [studentId, limit],
  );
}

export interface TrendingTag {
  tag_name: string;
  documents: number;
  recent_bookmarks: number;
}

/** Tags used by 2+ documents, ranked by bookmarks in the last 30 days (GROUP BY + HAVING). */
export function trendingTags(limit = 10): Promise<TrendingTag[]> {
  return query<TrendingTag>(
    `SELECT t.tag_name,
            COUNT(DISTINCT dt.doc_id)::INT AS documents,
            COUNT(b.student_id)::INT       AS recent_bookmarks
     FROM TAG t
     JOIN DOCUMENT_TAG dt ON dt.tag_id = t.tag_id
     LEFT JOIN BOOKMARK b ON b.doc_id = dt.doc_id AND b.bookmarked_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
     GROUP BY t.tag_id
     HAVING COUNT(DISTINCT dt.doc_id) >= 2
     ORDER BY recent_bookmarks DESC, documents DESC, t.tag_name
     LIMIT $1`,
    [limit],
  );
}

// ------------------------------------------------------------ admin dashboard

export interface PlatformTotals {
  students: number;
  admins: number;
  inactive: number;
  courses: number;
  documents: number;
  chunks: number;
  embedded_chunks: number;
  groups: number;
  memberships: number;
  bookmarks: number;
  searches: number;
}

export async function platformTotals(): Promise<PlatformTotals> {
  const row = await queryOne<PlatformTotals>(
    `SELECT
       (SELECT COUNT(*) FROM STUDENT WHERE role = 'student')::INT       AS students,
       (SELECT COUNT(*) FROM STUDENT WHERE role = 'admin')::INT         AS admins,
       (SELECT COUNT(*) FROM STUDENT WHERE NOT is_active)::INT          AS inactive,
       (SELECT COUNT(*) FROM COURSE)::INT                               AS courses,
       (SELECT COUNT(*) FROM DOCUMENT)::INT                             AS documents,
       (SELECT COUNT(*) FROM DOC_CHUNK)::INT                            AS chunks,
       (SELECT COUNT(*) FROM DOC_CHUNK WHERE embedding IS NOT NULL)::INT AS embedded_chunks,
       (SELECT COUNT(*) FROM STUDY_GROUP)::INT                          AS groups,
       (SELECT COUNT(*) FROM GROUP_MEMBERSHIP)::INT                     AS memberships,
       (SELECT COUNT(*) FROM BOOKMARK)::INT                             AS bookmarks,
       (SELECT COUNT(*) FROM SEARCH_LOG)::INT                           AS searches`,
  );
  if (!row) throw new Error("totals query returned nothing");
  return row;
}

export interface LabelCount {
  label: string;
  count: number;
}

export function documentsByVisibility(): Promise<LabelCount[]> {
  return query<LabelCount>(
    `SELECT visibility AS label, COUNT(*)::INT AS count FROM DOCUMENT GROUP BY visibility ORDER BY count DESC`,
  );
}

export function embeddingStatusCounts(): Promise<LabelCount[]> {
  return query<LabelCount>(
    `SELECT embedding_status AS label, COUNT(*)::INT AS count FROM DOCUMENT GROUP BY embedding_status ORDER BY label`,
  );
}

export interface DailySearches {
  day: string;
  keyword: number;
  semantic: number;
  hybrid: number;
}

/** Searches per day for the last 14 days, one column per mode (generate_series fills empty days). */
export function searchesPerDay(days = 14): Promise<DailySearches[]> {
  return query<DailySearches>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COUNT(l.log_id) FILTER (WHERE l.search_mode = 'keyword')::INT  AS keyword,
            COUNT(l.log_id) FILTER (WHERE l.search_mode = 'semantic')::INT AS semantic,
            COUNT(l.log_id) FILTER (WHERE l.search_mode = 'hybrid')::INT   AS hybrid
     FROM generate_series(CURRENT_DATE - ($1::INT - 1), CURRENT_DATE, INTERVAL '1 day') AS d(day)
     LEFT JOIN SEARCH_LOG l ON l.searched_at::DATE = d.day::DATE
     GROUP BY d.day
     ORDER BY d.day`,
    [days],
  );
}

export interface QueryInsight {
  query: string;
  times: number;
  students: number;
  avg_results: number;
}

/** Popular queries: asked 2+ times (GROUP BY + HAVING). */
export function topQueries(limit = 8): Promise<QueryInsight[]> {
  return query<QueryInsight>(
    `SELECT LOWER(query_text) AS query, COUNT(*)::INT AS times, COUNT(DISTINCT student_id)::INT AS students,
            ROUND(AVG(result_count), 1)::FLOAT AS avg_results
     FROM SEARCH_LOG
     GROUP BY LOWER(query_text)
     HAVING COUNT(*) >= 2
     ORDER BY times DESC, students DESC
     LIMIT $1`,
    [limit],
  );
}

/** Content gaps: queries that never returned anything -- topics students need notes for. */
export function contentGaps(limit = 8): Promise<QueryInsight[]> {
  return query<QueryInsight>(
    `SELECT LOWER(query_text) AS query, COUNT(*)::INT AS times, COUNT(DISTINCT student_id)::INT AS students,
            0::FLOAT AS avg_results
     FROM SEARCH_LOG
     GROUP BY LOWER(query_text)
     HAVING MAX(result_count) = 0
     ORDER BY times DESC, query
     LIMIT $1`,
    [limit],
  );
}

export interface CourseEngagement {
  course_id: number;
  course_code: string;
  course_title: string;
  enrolled_students: number;
  documents: number;
  bookmarks: number;
  study_groups: number;
  group_members: number;
  refreshed_at: string;
}

/** Reads the MATERIALIZED view (fast); refreshed by fn_refresh_course_stats(). */
export function courseEngagement(): Promise<CourseEngagement[]> {
  return query<CourseEngagement>("SELECT * FROM mv_course_engagement ORDER BY documents DESC, enrolled_students DESC");
}

export async function refreshCourseEngagement(): Promise<string> {
  const row = await queryOne<{ refreshed_at: string }>("SELECT fn_refresh_course_stats() AS refreshed_at");
  return row?.refreshed_at ?? new Date().toISOString();
}

export interface Contributor {
  student_id: number;
  full_name: string;
  documents: number;
  bookmarks_received: number;
  contribution_rank: number;
}

/** Top contributors: window function RANK() over bookmarks received. */
export function topContributors(limit = 6): Promise<Contributor[]> {
  return query<Contributor>(
    `SELECT s.student_id, s.full_name,
            COUNT(DISTINCT d.doc_id)::INT  AS documents,
            COUNT(b.student_id)::INT       AS bookmarks_received,
            RANK() OVER (ORDER BY COUNT(b.student_id) DESC, COUNT(DISTINCT d.doc_id) DESC)::INT AS contribution_rank
     FROM STUDENT s
     JOIN DOCUMENT d      ON d.student_id = s.student_id
     LEFT JOIN BOOKMARK b ON b.doc_id = d.doc_id AND b.student_id <> s.student_id
     GROUP BY s.student_id
     ORDER BY contribution_rank
     LIMIT $1`,
    [limit],
  );
}

export interface AuditRow {
  audit_id: number;
  table_name: string;
  action: string;
  row_pk: string;
  actor_name: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  logged_at: string;
}

export function auditLog(limit = 50, table?: string): Promise<AuditRow[]> {
  return query<AuditRow>(
    `SELECT a.audit_id, a.table_name, a.action, a.row_pk, s.full_name AS actor_name, a.old_data, a.new_data, a.logged_at
     FROM AUDIT_LOG a
     LEFT JOIN STUDENT s ON s.student_id = a.actor_id
     WHERE $2::TEXT IS NULL OR a.table_name = $2
     ORDER BY a.logged_at DESC, a.audit_id DESC
     LIMIT $1`,
    [limit, table ?? null],
  );
}

// Row shapes shared by server code and client components (types only).

export type Visibility = "public" | "course" | "private";
export type SearchMode = "hybrid" | "semantic" | "keyword";
export type EmbeddingStatus = "pending" | "ready" | "failed";

export interface CourseRow {
  course_id: number;
  course_code: string;
  course_title: string;
  department: string | null;
}

export interface DocumentCard {
  doc_id: number;
  title: string;
  description: string | null;
  file_type: string;
  file_size_bytes: number | null;
  visibility: Visibility;
  embedding_status: EmbeddingStatus;
  upload_date: string;
  owner_id: number;
  owner_name: string;
  course_id: number | null;
  course_code: string | null;
  course_title: string | null;
  tags: string[];
  bookmark_count: number;
  chunk_count: number;
}

export interface SearchHit extends DocumentCard {
  score: number;
  similarity: number | null;
  keyword_rank: number | null;
  semantic_rank: number | null;
  snippet: string | null;
}

export interface GroupRow {
  group_id: number;
  group_name: string;
  description: string | null;
  max_members: number;
  created_at: string;
  created_by: number | null;
  course_id: number;
  course_code: string;
  course_title: string;
  member_count: number;
  seats_left: number;
}

export interface GroupMemberRow {
  student_id: number;
  full_name: string;
  program: string | null;
  role: "admin" | "member";
  joined_at: string;
}

export interface GroupRecommendation {
  group_id: number;
  group_name: string;
  course_code: string;
  member_count: number;
  seats_left: number;
  similarity: number;
  shared_tags: string[];
  match_score: number;
}

export interface PartnerRecommendation {
  student_id: number;
  full_name: string;
  program: string | null;
  shared_courses: string[];
  similarity: number;
}

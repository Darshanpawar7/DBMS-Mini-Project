import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";

// Consistent API envelope: { ok: true, data } | { ok: false, error: { message, fields? } }
export interface ApiFailure {
  ok: false;
  error: { message: string; fields?: Record<string, string> };
}
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export { ApiError };

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

function fail(status: number, message: string, fields?: Record<string, string>): NextResponse<ApiFailure> {
  return NextResponse.json({ ok: false, error: { message, fields } }, { status });
}

// Friendly text for the CHECK / UNIQUE constraints users can actually hit.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_student_email_ci: "An account with this email already exists",
  chk_student_email: "Please enter a valid email address",
  chk_student_name: "Name must be at least 2 characters",
  chk_document_title: "Title must be at least 3 characters",
  chk_document_file_type: "Only PDF, TXT and Markdown files are supported",
  chk_document_file_size: "Files must be between 1 byte and 10 MB",
  chk_document_course_vis: "Course-only visibility needs a course",
  chk_tag_name: "Tags may only use lower-case letters, digits and - + # .",
  chk_enrollment_semester: "Semester must look like 2026-ODD or 2026-EVEN",
  chk_group_name: "Group name must be at least 3 characters",
  chk_group_max_members: "Group size must be between 2 and 20",
  uq_group_name_per_course: "A group with this name already exists for the course",
  chk_course_code: "Course code: 3-20 upper-case letters, digits or dashes",
  chk_course_title: "Course title must be at least 3 characters",
  course_course_code_key: "A course with this code already exists",
  enrollment_pkey: "You are already enrolled in this course for that semester",
  bookmark_pkey: "Already bookmarked",
  tag_tag_name_key: "That tag already exists",
};

// Custom SQLSTATEs raised by our triggers/procedures (see db/04_functions.sql)
const SQLSTATE_STATUS: Record<string, number> = {
  SM001: 409, // group full
  SM002: 403, // not enrolled
  SM003: 409, // last admin
  SM004: 409, // capacity below members
  SM404: 404,
  SM409: 409,
};

interface PgError {
  code?: string;
  constraint?: string;
  message?: string;
}

function isPgError(error: unknown): error is PgError {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as PgError).code === "string";
}

/** Translate any thrown value into an HTTP response without leaking internals. */
export function toErrorResponse(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ApiError) return fail(error.status, error.message, error.fields);

  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      fields[key] ??= issue.message;
    }
    return fail(400, "Please fix the highlighted fields", fields);
  }

  if (isPgError(error) && error.code) {
    if (error.code in SQLSTATE_STATUS) return fail(SQLSTATE_STATUS[error.code], error.message ?? "Request rejected");
    const friendly = error.constraint ? CONSTRAINT_MESSAGES[error.constraint] : undefined;
    if (error.code === "23505") return fail(409, friendly ?? "That record already exists");
    if (error.code === "23514") return fail(400, friendly ?? "The data failed a validation rule");
    if (error.code === "23503") return fail(409, "A related record is missing or still in use");
    if (error.code === "23502") return fail(400, "A required value is missing");
    if (error.code === "22P02") return fail(400, "Invalid value");
  }

  console.error("[api] unexpected error", error);
  return fail(500, "Something went wrong. Please try again.");
}

/**
 * Basic CSRF defence for cookie-authenticated mutations: a browser always
 * sends Origin on cross-site POST/PATCH/DELETE, so it must match our host.
 */
export function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) return; // same-origin fetches from older browsers, curl, tests
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || new URL(origin).host !== host) {
    throw new ApiError(403, "Cross-site request blocked");
  }
}

/** Wrap a route handler: origin check + uniform error handling. */
export function route<Ctx>(
  handler: (request: Request, context: Ctx) => Promise<Response>,
): (request: Request, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      assertSameOrigin(request);
      return await handler(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Parse a positive integer route/query parameter or throw 400. */
export function parseId(value: string | null | undefined, label = "id"): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, `Invalid ${label}`);
  return id;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

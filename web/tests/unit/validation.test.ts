import { describe, expect, test } from "vitest";
import {
  courseSchema,
  documentMetaSchema,
  enrollmentSchema,
  groupCreateSchema,
  loginSchema,
  registerSchema,
  searchSchema,
  splitTags,
} from "@/lib/validation";

describe("registerSchema", () => {
  test("accepts a valid student and normalises the email", () => {
    const result = registerSchema.parse({ full_name: "  Ananya Rao ", email: " Ananya.Rao@Example.EDU ", password: "secret123" });
    expect(result.full_name).toBe("Ananya Rao");
    expect(result.email).toBe("ananya.rao@example.edu");
    expect(result.program).toBeNull();
  });

  test.each([
    ["short", "Password must be at least 8 characters"],
    ["onlyletters", "Password needs a number"],
    ["12345678", "Password needs a letter"],
  ])("rejects weak password %s", (password, message) => {
    const result = registerSchema.safeParse({ full_name: "Test User", email: "t@example.com", password });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(message);
  });

  test("rejects a bad email and a one-letter name", () => {
    const result = registerSchema.safeParse({ full_name: "A", email: "not-an-email", password: "secret123" });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["full_name", "email"]));
  });

  test("rejects a year of study outside 1-6", () => {
    expect(registerSchema.safeParse({ full_name: "Test User", email: "t@example.com", password: "secret123", year_of_study: 9 }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  test("requires a password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("documentMetaSchema", () => {
  const base = { title: "Normal forms", visibility: "public", course_id: "", tags: [] };

  test("turns an empty course into null", () => {
    expect(documentMetaSchema.parse(base).course_id).toBeNull();
  });

  test("course-only visibility needs a course", () => {
    const result = documentMetaSchema.safeParse({ ...base, visibility: "course" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["course_id"]);
  });

  test("rejects unknown visibility and short titles", () => {
    expect(documentMetaSchema.safeParse({ ...base, visibility: "everyone" }).success).toBe(false);
    expect(documentMetaSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
  });

  test("caps the number of tags at 8", () => {
    const tags = Array.from({ length: 9 }, (_, i) => `tag${i}`);
    expect(documentMetaSchema.safeParse({ ...base, tags }).success).toBe(false);
  });
});

describe("splitTags", () => {
  test("splits, trims, lower-cases, hyphenates and de-duplicates", () => {
    expect(splitTags(" SQL, Query Tuning ,sql,, exam prep ")).toEqual(["sql", "query-tuning", "exam-prep"]);
  });

  test("returns [] for non-strings", () => {
    expect(splitTags(undefined)).toEqual([]);
    expect(splitTags(42)).toEqual([]);
  });
});

describe("other schemas", () => {
  test("semester must look like 2026-ODD", () => {
    expect(enrollmentSchema.parse({ course_id: "3", semester: "2026-odd" })).toEqual({ course_id: 3, semester: "2026-ODD" });
    expect(enrollmentSchema.safeParse({ course_id: 3, semester: "Fall 2026" }).success).toBe(false);
  });

  test("group size must be 2-20", () => {
    expect(groupCreateSchema.safeParse({ group_name: "DP crew", course_id: 1, max_members: 1 }).success).toBe(false);
    expect(groupCreateSchema.safeParse({ group_name: "DP crew", course_id: 1, max_members: 21 }).success).toBe(false);
    expect(groupCreateSchema.safeParse({ group_name: "DP crew", course_id: 1, max_members: 6 }).success).toBe(true);
  });

  test("course codes are upper-cased and checked", () => {
    expect(courseSchema.parse({ course_code: "ue23cs351a", course_title: "DBMS" }).course_code).toBe("UE23CS351A");
    expect(courseSchema.safeParse({ course_code: "bad code!", course_title: "DBMS" }).success).toBe(false);
  });

  test("search defaults to hybrid and needs 2+ characters", () => {
    expect(searchSchema.parse({ q: "bcnf" })).toMatchObject({ q: "bcnf", mode: "hybrid", course: null, tag: null });
    expect(searchSchema.safeParse({ q: "a" }).success).toBe(false);
    expect(searchSchema.safeParse({ q: "bcnf", mode: "fuzzy" }).success).toBe(false);
  });
});

describe("tag normalisation", () => {
  test("array tags with spaces are hyphenated and de-duplicated like the database trigger does", () => {
    const meta = documentMetaSchema.parse({ title: "Notes", visibility: "public", course_id: "", tags: ["Machine Learning", "machine learning", "sql"] });
    expect(meta.tags).toEqual(["machine-learning", "sql"]);
  });
});

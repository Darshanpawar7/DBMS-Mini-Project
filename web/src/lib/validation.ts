import { z } from "zod";

// App-side validation gives instant, field-level messages. The same rules are
// enforced again by CHECK constraints in the database (the final authority).

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} is too long`);

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(120);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long") // bcrypt only uses the first 72 bytes
  .regex(/[A-Za-z]/, "Password needs a letter")
  .regex(/[0-9]/, "Password needs a number");

export const registerSchema = z.object({
  full_name: trimmed(2, 100, "Name"),
  email: emailSchema,
  password: passwordSchema,
  program: z.string().trim().max(80).optional().transform((v) => v || null),
  year_of_study: z.coerce.number().int().min(1).max(6).optional().nullable(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(72),
});

export const VISIBILITIES = ["public", "course", "private"] as const;
export const SEARCH_MODES = ["hybrid", "semantic", "keyword"] as const;

const tagListSchema = z
  .array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9+#. -]{0,49}$/, "Tags: letters, digits, - + # ."))
  .max(8, "At most 8 tags")
  .default([]);

/** Parse "sql, Query Tuning ,indexing" into a clean, unique list. */
export function splitTags(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const tags = raw
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
  return [...new Set(tags)];
}

const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().int().positive().nullable(),
);

export const documentMetaSchema = z
  .object({
    title: trimmed(3, 200, "Title"),
    description: z.string().trim().max(500).optional().transform((v) => v || null),
    visibility: z.enum(VISIBILITIES),
    course_id: optionalId,
    tags: tagListSchema,
  })
  .refine((d) => d.visibility !== "course" || d.course_id !== null, {
    message: "Pick a course for course-only visibility",
    path: ["course_id"],
  });

export const documentUpdateSchema = documentMetaSchema;

export const searchSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(255),
  mode: z.enum(SEARCH_MODES).default("hybrid"),
  course: optionalId,
  tag: z.preprocess((v) => (v ? v : null), z.string().trim().toLowerCase().max(50).nullable()),
});

export const documentListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  course: optionalId,
  tag: z.preprocess((v) => (v ? v : undefined), z.string().trim().toLowerCase().max(50).optional()),
  scope: z.enum(["all", "mine", "bookmarked"]).default("all"),
  sort: z.enum(["recent", "popular", "title"]).default("recent"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const enrollmentSchema = z.object({
  course_id: z.coerce.number().int().positive(),
  semester: z.string().trim().toUpperCase().regex(/^[0-9]{4}-(ODD|EVEN)$/, "Semester must look like 2026-ODD"),
});

export const groupCreateSchema = z.object({
  group_name: trimmed(3, 100, "Group name"),
  description: z.string().trim().max(300).optional().transform((v) => v || null),
  course_id: z.coerce.number().int().positive("Pick a course"),
  max_members: z.coerce.number().int().min(2, "At least 2 seats").max(20, "At most 20 seats"),
});

export const groupUpdateSchema = groupCreateSchema.omit({ course_id: true });

export const memberRoleSchema = z.object({ role: z.enum(["admin", "member"]) });

export const adminUserUpdateSchema = z
  .object({
    role: z.enum(["student", "admin"]).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.is_active !== undefined, { message: "Nothing to update" });

export const courseSchema = z.object({
  course_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, "3-20 upper-case letters, digits or dashes"),
  course_title: trimmed(3, 150, "Course title"),
  department: z.string().trim().max(80).optional().transform((v) => v || null),
});

export const tagMergeSchema = z.object({
  from: z.string().trim().toLowerCase().min(1).max(50),
  into: z.string().trim().toLowerCase().min(1).max(50),
});

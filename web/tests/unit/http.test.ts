import { describe, expect, test } from "vitest";
import { z } from "zod";
import { ApiError, assertSameOrigin, parseId, readJson, toErrorResponse } from "@/lib/http";
import { highlightParts, formatBytes, timeAgo } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-redirect";

async function body(response: Response): Promise<{ ok: boolean; error: { message: string; fields?: Record<string, string> } }> {
  return response.json();
}

describe("toErrorResponse", () => {
  test("ApiError keeps its status and message", async () => {
    const res = toErrorResponse(new ApiError(403, "Admins only"));
    expect(res.status).toBe(403);
    expect((await body(res)).error.message).toBe("Admins only");
  });

  test("ZodError becomes 400 with per-field messages", async () => {
    const parsed = z.object({ title: z.string().min(3, "too short") }).safeParse({ title: "a" });
    const res = toErrorResponse(parsed.error);
    expect(res.status).toBe(400);
    expect((await body(res)).error.fields).toEqual({ title: "too short" });
  });

  test.each([
    [{ code: "23505", constraint: "uq_student_email_ci" }, 409, "An account with this email already exists"],
    [{ code: "23514", constraint: "chk_tag_name" }, 400, "Tags may only use lower-case letters, digits and - + # ."],
    [{ code: "23503" }, 409, "A related record is missing or still in use"],
    [{ code: "SM001", message: "This study group is full (4 of 4 seats taken)" }, 409, "This study group is full (4 of 4 seats taken)"],
    [{ code: "SM002", message: "Only students enrolled..." }, 403, "Only students enrolled..."],
  ])("maps PostgreSQL error %o", async (pgError, status, message) => {
    const res = toErrorResponse(pgError);
    expect(res.status).toBe(status);
    expect((await body(res)).error.message).toBe(message);
  });

  test("unknown errors become a generic 500 without internals", async () => {
    const res = toErrorResponse(new Error("connection string postgres://secret@host"));
    expect(res.status).toBe(500);
    expect((await body(res)).error.message).not.toContain("secret");
  });
});

describe("request guards", () => {
  test("cross-site mutation is blocked, same-site and GET are allowed", () => {
    const cross = new Request("http://localhost:3000/api/x", { method: "POST", headers: { origin: "http://evil.example", host: "localhost:3000" } });
    expect(() => assertSameOrigin(cross)).toThrow("Cross-site request blocked");
    const same = new Request("http://localhost:3000/api/x", { method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000" } });
    expect(() => assertSameOrigin(same)).not.toThrow();
    const get = new Request("http://localhost:3000/api/x", { headers: { origin: "http://evil.example", host: "localhost:3000" } });
    expect(() => assertSameOrigin(get)).not.toThrow();
  });

  test("parseId accepts positive integers only", () => {
    expect(parseId("42")).toBe(42);
    for (const bad of ["0", "-1", "1.5", "abc", undefined, "1;DROP TABLE"]) expect(() => parseId(bad)).toThrow(ApiError);
  });

  test("readJson rejects invalid JSON and non-objects", async () => {
    await expect(readJson(new Request("http://x", { method: "POST", body: "{oops" }))).rejects.toThrow("valid JSON");
    await expect(readJson(new Request("http://x", { method: "POST", body: "[1,2]" }))).rejects.toThrow("JSON object");
    await expect(readJson(new Request("http://x", { method: "POST", body: '{"a":1}' }))).resolves.toEqual({ a: 1 });
  });
});

describe("format helpers", () => {
  test("highlightParts turns ts_headline markers into safe parts (no HTML)", () => {
    expect(highlightParts("a ⟦BCNF⟧ b <script>")).toEqual([
      { text: "a ", hit: false },
      { text: "BCNF", hit: true },
      { text: " b <script>", hit: false },
    ]);
  });

  test("timeAgo and formatBytes", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(timeAgo("2026-10-13T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-13T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-01T12:00:00Z", now)).toBe("1w ago");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(null)).toBe("—");
  });
});

describe("rateLimit", () => {
  test("allows the limit, then answers 429 until the window resets", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(() => rateLimit(key, 3, 60_000)).not.toThrow();
    try {
      rateLimit(key, 3, 60_000);
      expect.unreachable("fourth attempt should be blocked");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(429);
    }
    expect(() => rateLimit(`${key}:other-user`, 3, 60_000)).not.toThrow();
  });
});

describe("safeNextPath (post-login redirect)", () => {
  const origin = "http://localhost:3000";
  test.each([
    ["/groups/3", "/groups/3"],
    ["/search?q=bcnf", "/search?q=bcnf"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"], // a backslash counts as a slash in http(s) URLs
    ["/%5Cevil.com", "/%5Cevil.com"], // percent-encoded stays a harmless local path
    ["https://evil.com/login", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
  ])("%s -> %s", (next, expected) => {
    expect(safeNextPath(next, origin)).toBe(expected);
  });
});

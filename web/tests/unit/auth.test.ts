import { SignJWT } from "jose";
import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signSession, verifySession } from "@/lib/auth/token";

const SECRET = "test-secret-that-is-at-least-thirty-two-characters";
// the same rule as CHECK chk_student_pwd_bcrypt in db/02_phase2_alter.sql
const DB_BCRYPT_RULE = /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/;

describe("password hashing", () => {
  test("produces a bcrypt hash the database CHECK accepts", async () => {
    const hash = await hashPassword("Scholar@123");
    expect(hash).toMatch(DB_BCRYPT_RULE);
    expect(hash).not.toContain("Scholar@123");
  });

  test("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("Scholar@123");
    await expect(verifyPassword("Scholar@123", hash)).resolves.toBe(true);
    await expect(verifyPassword("scholar@123", hash)).resolves.toBe(false);
  });

  test("hashes are salted (same input, different hash)", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
  });
});

describe("session tokens", () => {
  test("round-trips user id and role", async () => {
    const token = await signSession({ userId: 7, role: "admin" }, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toEqual({ userId: 7, role: "admin" });
  });

  test("rejects a token signed with another secret", async () => {
    const token = await signSession({ userId: 7, role: "student" }, "another-secret-that-is-at-least-thirty-two-chars");
    await expect(verifySession(token, SECRET)).resolves.toBeNull();
  });

  test("rejects a tampered token (role escalation attempt)", async () => {
    const token = await signSession({ userId: 7, role: "student" }, SECRET);
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "7", role: "admin" })).toString("base64url");
    await expect(verifySession(`${header}.${forgedPayload}.${signature}`, SECRET)).resolves.toBeNull();
  });

  test("rejects an expired token", async () => {
    const expired = await new SignJWT({ role: "student" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("7")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifySession(expired, SECRET)).resolves.toBeNull();
  });

  test("rejects missing or garbage tokens and unknown roles", async () => {
    await expect(verifySession(undefined, SECRET)).resolves.toBeNull();
    await expect(verifySession("not.a.jwt", SECRET)).resolves.toBeNull();
    const weird = await new SignJWT({ role: "superuser" }).setProtectedHeader({ alg: "HS256" }).setSubject("7").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
    await expect(verifySession(weird, SECRET)).resolves.toBeNull();
  });
});

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { findActiveStudentById, type SessionUser } from "@/lib/repos/students";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./token";
import { ApiError } from "@/lib/errors";

/** Data Access Layer entry point: who is making this request? (deduplicated per request) */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySession(token, env().AUTH_SECRET);
  if (!claims) return null;
  return findActiveStudentById(claims.userId);
});

/** Pages: send anonymous visitors to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Pages: admins only. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/** Route handlers: 401 / 403 instead of redirects. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Please log in first");
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (user.role !== "admin") throw new ApiError(403, "Admins only");
  return user;
}

export async function startSession(user: Pick<SessionUser, "student_id" | "role">): Promise<void> {
  const token = await signSession({ userId: user.student_id, role: user.role }, env().AUTH_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

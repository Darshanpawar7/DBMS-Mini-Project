import { SignJWT, jwtVerify } from "jose";

// Session token = HS256-signed JWT kept in an httpOnly cookie. It carries only
// the user id and role; the user row is re-read from the database on every
// request (see current-user.ts), so a role change or deactivation applies at once.
export const SESSION_COOKIE = "sm_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Role = "student" | "admin";

export interface SessionClaims {
  userId: number;
  role: Role;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    const userId = Number(payload.sub);
    const role = payload.role;
    if (!Number.isInteger(userId) || (role !== "student" && role !== "admin")) return null;
    return { userId, role };
  } catch {
    return null; // expired, tampered or malformed
  }
}

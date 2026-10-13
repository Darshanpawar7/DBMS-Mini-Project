import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

// Optimistic gate only: a missing or invalid cookie is turned away early.
// Everything that depends on the user's *current* state (active? admin?) is
// decided by pages and route handlers, which re-read the user from the
// database -- so a deactivated, deleted or newly promoted user is handled
// correctly even while an older cookie is still valid.
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/register"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET ?? "");

  if (pathname.startsWith("/api/")) {
    if (!session && !PUBLIC_API.has(pathname)) {
      return NextResponse.json({ ok: false, error: { message: "Please log in first" } }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/search/:path*", "/documents/:path*", "/groups/:path*", "/courses/:path*", "/admin/:path*"],
};

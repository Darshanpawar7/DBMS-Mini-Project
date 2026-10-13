import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

// Optimistic gate only: it reads the signed cookie to redirect early. Every
// page and route handler still re-checks the user (and role) against the database.
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/register"]);
const AUTH_PAGES = new Set(["/login", "/register"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.AUTH_SECRET ?? "";
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret);

  if (pathname.startsWith("/api/")) {
    if (!session && !PUBLIC_API.has(pathname)) {
      return NextResponse.json({ ok: false, error: { message: "Please log in first" } }, { status: 401 });
    }
    if (pathname.startsWith("/api/admin/") && session?.role !== "admin") {
      return NextResponse.json({ ok: false, error: { message: "Admins only" } }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (AUTH_PAGES.has(pathname)) {
    return session ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  if (pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/login", "/register", "/dashboard/:path*", "/search/:path*", "/documents/:path*", "/groups/:path*", "/courses/:path*", "/admin/:path*"],
};

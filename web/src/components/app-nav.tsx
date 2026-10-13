"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "./api-client";
import { Brand } from "./brand";
import { Avatar, cx } from "./ui";

type Props = {
  user: { full_name: string; email: string; role: "student" | "admin" };
};

const STUDENT_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/search", label: "Search" },
  { href: "/documents", label: "Library" },
  { href: "/groups", label: "Study groups" },
  { href: "/courses", label: "Courses" },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/content", label: "Courses & tags" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AppNav({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = user.role === "admin";
  const links = isAdmin ? [...ADMIN_LINKS, { href: "/search", label: "Search" }, { href: "/documents", label: "Library" }] : STUDENT_LINKS;

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Brand href={isAdmin ? "/admin" : "/dashboard"} />
        <nav aria-label="Main" className={cx("absolute inset-x-0 top-16 border-b border-line bg-white p-3 md:static md:flex md:border-0 md:bg-transparent md:p-0", isOpen ? "block" : "hidden md:flex")}>
          <ul className="flex flex-col gap-1 md:flex-row">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cx(
                    "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(link.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-ink",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2.5 sm:flex">
            <Avatar name={user.full_name} size="sm" />
            <div className="leading-tight">
              <p className="text-sm font-medium text-ink">{user.full_name}</p>
              <p className="text-xs text-muted">{isAdmin ? "Administrator" : "Student"}</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-ink">
            Log out
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle menu"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

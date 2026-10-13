import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // Signed-in users skip the forms. This is a database check, so a stale cookie
  // for a deactivated or deleted account still gets the login form.
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#e0e7ff_0%,transparent_60%)] px-4 py-12">
      <div className="mb-8">
        <Brand />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-xl shadow-brand-900/5">{children}</div>
    </div>
  );
}

import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth/current-user";

// Every page in this group needs a signed-in, active user (checked against the DB).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <AppNav user={{ full_name: user.full_name, email: user.email, role: user.role }} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

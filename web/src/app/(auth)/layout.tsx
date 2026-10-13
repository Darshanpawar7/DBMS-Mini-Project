import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#e0e7ff_0%,transparent_60%)] px-4 py-12">
      <div className="mb-8">
        <Brand />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-xl shadow-brand-900/5">{children}</div>
    </div>
  );
}

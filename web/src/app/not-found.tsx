import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-6xl font-semibold text-brand-600">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-muted">The page does not exist, or it belongs to a note you are not allowed to open.</p>
      <LinkButton href="/dashboard" className="mt-6">
        Back to dashboard
      </LinkButton>
    </div>
  );
}

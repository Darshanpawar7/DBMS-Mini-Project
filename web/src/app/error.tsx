"use client";

import { buttonClass } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">The server could not finish this request. Check that the database is running, then try again.</p>
      <button type="button" onClick={reset} className={`${buttonClass()} mt-6`}>
        Try again
      </button>
    </div>
  );
}

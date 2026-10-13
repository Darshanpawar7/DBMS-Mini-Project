"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { apiFetch } from "./api-client";
import { buttonClass, cx } from "./ui";

type Props = {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  json?: unknown;
  confirmText?: string;
  redirectTo?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
};

/** A button that calls one API endpoint, then refreshes the page data (or navigates). */
export function ActionButton({ url, method = "POST", json, confirmText, redirectTo, variant = "secondary", size = "sm", className, children }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    setIsBusy(true);
    const result = await apiFetch(url, { method, json });
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    startTransition(() => {
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <span className={cx("inline-flex flex-col items-start gap-1", className)}>
      <button type="button" onClick={handleClick} disabled={isBusy || isPending} className={buttonClass(variant, size)}>
        {isBusy || isPending ? "Working…" : children}
      </button>
      {error && (
        <span role="alert" className="max-w-xs text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}

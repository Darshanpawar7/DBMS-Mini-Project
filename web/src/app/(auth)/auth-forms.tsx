"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/components/api-client";
import { Alert, Field, buttonClass, inputClass } from "@/components/ui";
import { safeNextPath } from "@/lib/safe-redirect";

type FieldErrors = Record<string, string>;

function useSubmit(url: string, next: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [isBusy, setIsBusy] = useState(false);

  async function submit(payload: unknown) {
    setIsBusy(true);
    setError(null);
    setFields({});
    const result = await apiFetch<{ user: { role: string } }>(url, { json: payload });
    if (!result.ok) {
      setIsBusy(false);
      setError(result.error.message);
      setFields(result.error.fields ?? {});
      return;
    }
    const target = safeNextPath(next, window.location.origin);
    router.replace(result.data.user.role === "admin" && target === "/dashboard" ? "/admin" : target);
    router.refresh();
  }
  return { submit, error, fields, isBusy };
}

export function LoginForm({ next }: { next: string }) {
  const { submit, error, fields, isBusy } = useSubmit("/api/auth/login", next);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit({ email: form.get("email"), password: form.get("password") });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
      {error && <Alert>{error}</Alert>}
      <Field label="Email" htmlFor="email" error={fields.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password" error={fields.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <button type="submit" disabled={isBusy} className={`${buttonClass()} w-full`}>
        {isBusy ? "Signing in…" : "Log in"}
      </button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const { submit, error, fields, isBusy } = useSubmit("/api/auth/register", "/courses");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const year = form.get("year_of_study");
    void submit({
      full_name: form.get("full_name"),
      email: form.get("email"),
      password: form.get("password"),
      program: form.get("program"),
      year_of_study: year ? Number(year) : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <h1 className="font-display text-2xl font-semibold">Create your account</h1>
      {error && <Alert>{error}</Alert>}
      <Field label="Full name" htmlFor="full_name" error={fields.full_name}>
        <input id="full_name" name="full_name" autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="University email" htmlFor="email" error={fields.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" htmlFor="password" error={fields.password} hint="At least 8 characters, with a letter and a number.">
        <input id="password" name="password" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Programme" htmlFor="program" error={fields.program}>
          <input id="program" name="program" placeholder="B.Tech CSE" className={inputClass} />
        </Field>
        <Field label="Year" htmlFor="year_of_study" error={fields.year_of_study}>
          <select id="year_of_study" name="year_of_study" className={inputClass} defaultValue="">
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button type="submit" disabled={isBusy} className={`${buttonClass()} w-full`}>
        {isBusy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

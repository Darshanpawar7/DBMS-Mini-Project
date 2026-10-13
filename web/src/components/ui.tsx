import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { highlightParts, initials } from "@/lib/format";
import type { Visibility } from "@/lib/types";

// Presentational building blocks (server-safe: no hooks, no browser APIs).

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,box-shadow,transform] active:translate-y-px",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700",
    variant === "secondary" && "border border-line bg-white text-ink hover:bg-slate-50",
    variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-ink",
    variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  );
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-700",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", BADGE_TONES[tone], className)}>{children}</span>;
}

const VISIBILITY: Record<Visibility, { tone: keyof typeof BADGE_TONES; label: string }> = {
  public: { tone: "green", label: "Public" },
  course: { tone: "blue", label: "Course only" },
  private: { tone: "neutral", label: "Private" },
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const v = VISIBILITY[visibility];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function TagList({ tags, limit = 4 }: { tags: string[]; limit?: number }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, limit);
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((tag) => (
        <li key={tag}>
          <Link href={`/documents?tag=${encodeURIComponent(tag)}`} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-brand-50 hover:text-brand-700">
            #{tag}
          </Link>
        </li>
      ))}
      {tags.length > limit && <li className="px-1 text-xs text-muted">+{tags.length - limit}</li>}
    </ul>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700",
        size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Renders ts_headline output safely: markers become <mark>, everything else is plain text. */
export function Highlighted({ snippet }: { snippet: string }) {
  return (
    <>
      {highlightParts(snippet).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/** A thin horizontal meter, e.g. for similarity scores. */
export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct * 100}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted">{Math.round(pct * 100)}%</span>
    </span>
  );
}

// ---------------------------------------------------------------- form controls

const fieldBase =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-ink shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50";
export const inputClass = `block w-full ${fieldBase}`;
/** Same look, sized to its content (for filter rows). */
export const inlineInputClass = `w-auto max-w-full ${fieldBase}`;

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "amber"; children: ReactNode }) {
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={cx(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "red" && "border-red-200 bg-red-50 text-red-800",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "amber" && "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {children}
    </div>
  );
}

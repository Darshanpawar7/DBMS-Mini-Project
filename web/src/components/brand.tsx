import Link from "next/link";

/** Logo: three linked nodes -- notes connected by meaning. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="ScholarMesh home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-brand-600" />
        <path d="M10 21 L16 10 L22 21 Z" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1.6" />
        <circle cx="16" cy="10" r="3" fill="white" />
        <circle cx="10" cy="21" r="3" fill="white" />
        <circle cx="22" cy="21" r="3" fill="#fde68a" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">ScholarMesh</span>
    </Link>
  );
}

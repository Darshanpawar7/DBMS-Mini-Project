/** Only follow a ?next= target that stays on this site (blocks //evil.com, /\evil.com, javascript: …). */
export function safeNextPath(next: string, origin: string, fallback = "/dashboard"): string {
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}

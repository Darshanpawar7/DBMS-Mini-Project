"use client";

import type { ApiResult } from "@/lib/http";

/** Browser-side call to our own API. Always resolves to the { ok, data | error } envelope. */
export async function apiFetch<T>(url: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: init.method ?? (init.json || init.form ? "POST" : "GET"),
      headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    });
    const body = (await response.json().catch(() => null)) as ApiResult<T> | null;
    if (body && typeof body === "object" && "ok" in body) return body;
    return { ok: false, error: { message: `Unexpected response (${response.status})` } };
  } catch {
    return { ok: false, error: { message: "Network error — is the server running?" } };
  }
}

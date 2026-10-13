"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/components/api-client";
import { Alert, Badge, EmptyState, Highlighted, Meter, TagList, VisibilityBadge, buttonClass, cx, inlineInputClass, inputClass } from "@/components/ui";
import type { SearchResponse } from "@/lib/repos/search";
import type { SearchHit, SearchMode } from "@/lib/types";

type Query = { q: string; mode: SearchMode; course: string; tag: string };

type Props = {
  courses: { id: number; label: string }[];
  tags: string[];
  initialQuery: Query;
  initialResponse: SearchResponse | null;
};

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: "hybrid", label: "Hybrid", hint: "Keyword + meaning, merged with Reciprocal Rank Fusion" },
  { value: "semantic", label: "Semantic", hint: "Meaning only: cosine similarity of 384-d embeddings (pgvector, HNSW)" },
  { value: "keyword", label: "Keyword", hint: "Exact terms only: tsvector + GIN index, ranked by ts_rank_cd" },
];

const EXAMPLES = ["how do models decide which words matter", "why does my table have duplicate data", "what happens when I type a URL", "stop a model from memorising the training set"];

function toParams(query: Query): URLSearchParams {
  const params = new URLSearchParams({ q: query.q, mode: query.mode });
  if (query.course) params.set("course", query.course);
  if (query.tag) params.set("tag", query.tag);
  return params;
}

export function SearchClient({ courses, tags, initialQuery, initialResponse }: Props) {
  const [query, setQuery] = useState<Query>(initialQuery);
  const [response, setResponse] = useState<SearchResponse | null>(initialResponse);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function run(next: Query) {
    if (next.q.trim().length < 2) {
      setError("Type at least 2 characters.");
      return;
    }
    setQuery(next);
    setIsBusy(true);
    setError(null);
    const params = toParams(next);
    const result = await apiFetch<SearchResponse>(`/api/search?${params}`);
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setResponse(result.data);
    // keep the URL shareable without a server round trip
    window.history.replaceState(null, "", `/search?${params}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(query);
  }

  const activeMode = MODES.find((m) => m.value === query.mode) ?? MODES[0];

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5" role="search">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="q" className="sr-only">
            Search query
          </label>
          <input
            id="q"
            name="q"
            value={query.q}
            onChange={(e) => setQuery({ ...query, q: e.target.value })}
            placeholder="Ask in your own words…"
            autoFocus
            className={`${inputClass} h-12 text-base`}
          />
          <button type="submit" disabled={isBusy} className={cx(buttonClass("primary"), "h-12 px-6")}>
            {isBusy ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Search mode" className="inline-flex rounded-lg bg-slate-100 p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={query.mode === m.value}
                onClick={() => (query.q.trim().length >= 2 ? void run({ ...query, mode: m.value }) : setQuery({ ...query, mode: m.value }))}
                className={cx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  query.mode === m.value ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select aria-label="Filter by course" value={query.course} onChange={(e) => setQuery({ ...query, course: e.target.value })} className={inlineInputClass}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select aria-label="Filter by tag" value={query.tag} onChange={(e) => setQuery({ ...query, tag: e.target.value })} className={inlineInputClass}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-xs text-muted">{activeMode.hint}</p>
      </form>

      {error && <Alert>{error}</Alert>}

      {!response && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6">
          <p className="text-sm font-medium text-ink">Try a question with no exact keywords:</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button type="button" onClick={() => void run({ ...query, q: example })} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-brand-200 hover:bg-brand-50">
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {response && (
        <section aria-live="polite">
          <p className="mb-3 text-sm text-muted">
            {response.hits.length} result{response.hits.length === 1 ? "" : "s"} · {response.mode} mode · {response.tookMs} ms
            {response.mode !== query.mode && " (embedding model unavailable, so this fell back to keyword search)"}
          </p>
          {response.hits.length === 0 ? (
            <EmptyState title="No notes matched" body="Try Semantic mode, fewer filters, or different words. This query is logged so admins can see which topics need notes." />
          ) : (
            <ol className="space-y-3">
              {response.hits.map((hit, index) => (
                <ResultItem key={hit.doc_id} hit={hit} position={index + 1} mode={response.mode} />
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

function ResultItem({ hit, position, mode }: { hit: SearchHit; position: number; mode: SearchMode }) {
  const isHighlighted = hit.snippet?.includes("⟦") ?? false;
  return (
    <li className="rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-mono text-slate-400">#{position}</span>
            {hit.course_code && <span className="font-medium text-brand-700">{hit.course_code}</span>}
            <span>by {hit.owner_name}</span>
            <VisibilityBadge visibility={hit.visibility} />
          </p>
          <Link href={`/documents/${hit.doc_id}`} className="font-display text-lg font-semibold text-ink hover:text-brand-700">
            {hit.title}
          </Link>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          {hit.similarity !== null && <Meter value={hit.similarity} label="Cosine similarity to your question" />}
          {mode === "hybrid" && (
            <span className="flex gap-1.5">
              {hit.keyword_rank && <Badge tone="amber">keyword #{hit.keyword_rank}</Badge>}
              {hit.semantic_rank && <Badge tone="brand">meaning #{hit.semantic_rank}</Badge>}
            </span>
          )}
          {mode === "keyword" && <Badge tone="amber">rank {hit.score.toFixed(3)}</Badge>}
        </div>
      </div>
      {hit.snippet && (
        <p className="mt-3 border-l-2 border-brand-100 pl-3 text-sm leading-relaxed text-slate-600">
          {isHighlighted ? <Highlighted snippet={hit.snippet} /> : <>“{hit.snippet.length > 320 ? `${hit.snippet.slice(0, 320)}…` : hit.snippet}”</>}
        </p>
      )}
      <div className="mt-3">
        <TagList tags={hit.tags} />
      </div>
    </li>
  );
}

import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";

const FEATURES = [
  {
    title: "Search by meaning",
    body: "Every note is split into passages and embedded with a sentence model. pgvector finds the passages closest in meaning to your question — even when no word matches.",
  },
  {
    title: "Matched study groups",
    body: "Your uploads, bookmarks and searches form an interest vector. Groups and classmates are ranked by how close their vectors are to yours.",
  },
  {
    title: "Access you can trust",
    body: "Public, course-only or private. The rule lives in one database function that every search and listing goes through.",
  },
];

export default async function LandingPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,#e0e7ff_0%,transparent_55%)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Brand />
        <nav className="flex gap-2">
          <LinkButton href="/login" variant="ghost">
            Log in
          </LinkButton>
          <LinkButton href="/register">Create account</LinkButton>
        </nav>
      </header>

      <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.1fr_1fr]">
        <section>
          <p className="mb-4 inline-flex rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700">
            PostgreSQL + pgvector · Next.js
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Find notes by <em className="text-brand-600 not-italic underline decoration-amber-300 decoration-4 underline-offset-4">meaning</em>, not by filename.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            ScholarMesh is a shared library for your semester. Upload notes, search them the way you think, and meet the classmates who are studying the same ideas.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/register">Get started</LinkButton>
            <LinkButton href="/login" variant="secondary">
              I have an account
            </LinkButton>
          </div>
          <p className="mt-6 text-sm text-muted">
            Demo: <code className="rounded bg-white px-1.5 py-0.5 text-ink">darshan.pawar@scholarmesh.test</code> /{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-ink">Scholar@123</code>
          </p>
        </section>

        <section aria-label="Example search" className="relative">
          <div className="absolute -inset-4 -z-10 rotate-2 rounded-3xl bg-amber-100/60" aria-hidden />
          <div className="rounded-2xl border border-line bg-white p-5 shadow-xl shadow-brand-900/5">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-400" aria-hidden>
                <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" />
              </svg>
              how do models decide which words matter?
            </div>
            <ul className="mt-4 space-y-3">
              {[
                ["Transformers and Self-Attention Explained", "…each token builds a query, a key and a value, and weighs every other token…", 0.62],
                ["Word Embeddings: word2vec and GloVe", "…words that appear in similar contexts end up close together…", 0.41],
                ["RNNs, LSTMs and the Vanishing Gradient", "…gates decide what to keep and what to forget…", 0.37],
              ].map(([title, snippet, score]) => (
                <li key={title as string} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-ink">{title}</p>
                    <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium tabular-nums text-brand-700">
                      {Math.round((score as number) * 100)}% match
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{snippet}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <section className="border-t border-line bg-white/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title}>
              <p className="font-display text-sm text-brand-600">0{i + 1}</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-ink">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted">
          DBMS Mini Project · PES University · Darshan P Pawar (PES2UG24CS143) &amp; Dhanush V Biradar (PES2UG24CS155)
        </p>
      </footer>
    </div>
  );
}

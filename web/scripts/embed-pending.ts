/**
 * Embedding worker (batch mode): computes vectors for every chunk without one
 * and for search queries that were logged without one.
 *
 *   npm run db:embed
 */
import path from "node:path";

async function main(): Promise<void> {
  process.loadEnvFile(path.resolve(__dirname, "..", ".env.local"));
  // imported after the env file is loaded
  const { processPendingEmbeddings } = await import("../src/lib/repos/embedding-jobs");
  const { pool } = await import("../src/lib/db");

  const started = Date.now();
  console.log("Loading the embedding model (first run downloads ~23 MB)...");
  const summary = await processPendingEmbeddings(1000);
  const { rows } = await pool().query("SELECT fn_refresh_course_stats() AS refreshed_at");
  console.log(
    `Embedded ${summary.chunks} chunks across ${summary.documents} documents` +
      ` (${summary.failed} failed) and ${summary.searches} search queries in ${Date.now() - started} ms.`,
  );
  console.log(`Analytics view refreshed at ${rows[0].refreshed_at.toISOString?.() ?? rows[0].refreshed_at}.`);
  await pool().end();
}

main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  if (code === "28P01") {
    console.error(
      "Cannot log in as the app user: the password inside DATABASE_URL (web/.env.local) does not match the database.\n" +
        "Make it equal to APP_DB_PASSWORD in ../.env, then run  npm run db:setup  (this also resets the demo data).",
    );
  } else if (code === "ECONNREFUSED") {
    console.error("Cannot reach PostgreSQL. Is Docker Desktop running? Start the database with:  docker compose up -d");
  } else {
    console.error(error);
  }
  process.exit(1);
});

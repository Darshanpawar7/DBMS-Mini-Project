/**
 * Builds the ScholarMesh database from the SQL files in ../db.
 *
 *   npm run db:setup            schema + functions + triggers + grants + seed data
 *   npm run db:setup -- --no-seed   schema only
 *
 * Runs as the PostgreSQL superuser from ../.env (never used by the web app),
 * and creates/updates the least-privilege login `scholarmesh_app` that the app uses.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const ROOT = path.resolve(__dirname, "..", "..");
const DB_DIR = path.join(ROOT, "db");
const APP_ROLE = "scholarmesh_app";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing -- copy .env.example to .env in the project root`);
  return value;
}

async function sqlFiles(includeSeed: boolean): Promise<string[]> {
  const all = (await readdir(DB_DIR)).filter((f) => /^\d{2}[a-z]?_.+\.sql$/.test(f)).sort();
  // 0x_ = schema, functions, triggers, grants; 07+ = seed data. Files named *queries* are demos, not setup.
  return all.filter((f) => !f.includes("queries") && (includeSeed || Number(f.slice(0, 2)) < 7));
}

async function main(): Promise<void> {
  process.loadEnvFile(path.join(ROOT, ".env"));
  const includeSeed = !process.argv.includes("--no-seed");

  const client = new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5433),
    user: requireEnv("POSTGRES_USER"),
    password: requireEnv("POSTGRES_PASSWORD"),
    database: requireEnv("POSTGRES_DB"),
  });
  await client.connect();
  client.on("notice", () => undefined); // silence "does not exist, skipping"

  try {
    // 1. least-privilege application login (password comes from the environment)
    const password = client.escapeLiteral(requireEnv("APP_DB_PASSWORD"));
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    const verb = exists.rowCount ? "ALTER" : "CREATE";
    await client.query(`${verb} ROLE ${APP_ROLE} LOGIN PASSWORD ${password} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    console.log(`role ${APP_ROLE}: ${verb === "CREATE" ? "created" : "password refreshed"}`);

    // 2. run every SQL file in order; each file is one simple-protocol batch
    for (const file of await sqlFiles(includeSeed)) {
      const started = Date.now();
      const sql = await readFile(path.join(DB_DIR, file), "utf8");
      try {
        await client.query(sql);
      } catch (error) {
        const pgError = error as { message?: string; position?: string };
        const line = pgError.position ? sql.slice(0, Number(pgError.position)).split("\n").length : "?";
        throw new Error(`${file} failed near line ${line}: ${pgError.message}`);
      }
      console.log(`  ok  ${file.padEnd(28)} ${Date.now() - started} ms`);
    }

    if (includeSeed) {
      console.log("\nSeed loaded. Next: `npm run db:embed` to compute the embeddings.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

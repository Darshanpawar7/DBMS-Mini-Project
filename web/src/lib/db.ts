import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

// One pool per server process. In development, hot reloads re-evaluate this
// module, so the pool is parked on globalThis to avoid leaking connections.
const globalForPool = globalThis as unknown as { scholarmeshPool?: Pool };

export function pool(): Pool {
  if (!globalForPool.scholarmeshPool) {
    globalForPool.scholarmeshPool = new Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      application_name: "scholarmesh-web",
    });
  }
  return globalForPool.scholarmeshPool;
}

/** Run one parameterised statement. Values are always sent separately from the SQL text. */
export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run `work` inside BEGIN ... COMMIT on one connection; any error rolls the
 * whole unit back. `actorId` is exposed to the audit trigger through the
 * transaction-local setting app.current_user_id.
 */
export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
  options: { actorId?: number | null } = {},
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    if (options.actorId) {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(options.actorId)]);
    }
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** pgvector text format: '[0.1,0.2,...]' */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

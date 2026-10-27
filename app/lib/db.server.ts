/**
 * One database API for both places the app runs:
 * - Deployed (Duplo): real Postgres from DATABASE_URL, TLS per PGSSLMODE.
 * - Local: an embedded Postgres (PGlite) in .data/pglite, so `npm run dev`
 *   works with no database server. Only one process can open it at a time,
 *   so stop the dev server before running scripts like `npm run seed`.
 *
 * Tests use PGLITE_DIR=memory:// (see vitest.config.ts) for a fresh in-memory database.
 *
 * Use `query` for reads/writes and `transaction` when several writes must
 * land together. Parameters are positional ($1, $2, ...); pass JS arrays for
 * text[] columns and JSON.stringify(value) for jsonb columns.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { SCHEMA_SQL } from "./schema.server";

export type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
};

type Driver = Queryable & {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
};

async function createPgDriver(url: string): Promise<Driver> {
  const sslmode = process.env.PGSSLMODE;
  const pool = new pg.Pool({
    connectionString: url,
    ssl:
      sslmode && sslmode !== "disable"
        ? { rejectUnauthorized: sslmode === "verify-full" }
        : undefined,
    max: 10,
  });
  const run = async <T>(client: pg.Pool | pg.PoolClient, sql: string, params?: unknown[]) =>
    (await client.query(sql, params as unknown[] | undefined)).rows as T[];
  return {
    query: (sql, params) => run(pool, sql, params),
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (sql, params) => run(client, sql, params) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function createPgliteDriver(dir: string): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir);
  return {
    query: async (sql, params) => (await db.query(sql, params as unknown[] | undefined)).rows as any,
    exec: async (sql) => {
      await db.exec(sql);
    },
    transaction: (fn) =>
      db.transaction(async (tx) =>
        fn({ query: async (sql, params) => (await tx.query(sql, params as unknown[] | undefined)).rows as any }),
      ),
  };
}

// Survives dev-server hot reloads, so we never open the database twice.
const globalForDb = globalThis as unknown as { __nvaDb?: Promise<Driver>; __nvaReady?: Promise<void> };

async function init(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  const driver = url
    ? await createPgDriver(url)
    : await createPgliteDriver(process.env.PGLITE_DIR ?? path.resolve(".data/pglite"));
  await driver.exec(SCHEMA_SQL);
  // One-time data moves that go with the schema (guarded per database in app_meta).
  const { runDataMigrations } = await import("./migrations.server");
  await runDataMigrations(driver);
  const { bootstrapAdminFromEnv } = await import("./bootstrap.server");
  await bootstrapAdminFromEnv(driver);
  return driver;
}


function getDriver(): Promise<Driver> {
  if (!globalForDb.__nvaDb) {
    globalForDb.__nvaDb = init().catch((error) => {
      globalForDb.__nvaDb = undefined;
      throw error;
    });
  }
  return globalForDb.__nvaDb;
}

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return (await getDriver()).query<T>(sql, params);
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return (await getDriver()).transaction(fn);
}

/**
 * Resolves once startup work that needs query() is done: today, loading the
 * demo data when SEED_DEMO=true. Pages wait on it (via getUser) so the first
 * visitor never sees a half-seeded database.
 */
export function whenReady(): Promise<void> {
  globalForDb.__nvaReady ??= (async () => {
    await getDriver();
    const { seedDemoFromEnv } = await import("./demo-seed.server");
    await seedDemoFromEnv();
  })().catch((error) => {
    globalForDb.__nvaReady = undefined;
    throw error;
  });
  return globalForDb.__nvaReady;
}

/** For scripts: run the schema and data migrations, and return when the database is ready. */
export async function ensureDatabase(): Promise<void> {
  await getDriver();
}

export function newId(): string {
  return crypto.randomUUID();
}

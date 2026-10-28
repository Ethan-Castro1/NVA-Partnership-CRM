/**
 * One database API for both places the app runs:
 * - Deployed (Easel, Playlab's lab school hosting on AWS): real Postgres from
 *   DATABASE_URL, TLS per PGSSLMODE. There the app connects as a role that can
 *   read and write rows but not change tables, so the schema is applied by
 *   `npm run db:migrate` (the deploy's before_update job, as the database
 *   owner) and the server only checks it is in place (see init()).
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
import { schemaRunSql, schemaVersionKey } from "./schema.server";

export type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
};

type Driver = Queryable & {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
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
    close: () => pool.end(),
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
    close: () => db.close(),
  };
}

// Survives dev-server hot reloads, so we never open the database twice.
const globalForDb = globalThis as unknown as { __nvaDb?: Promise<Driver>; __nvaReady?: Promise<void> };

function openDriver(url = process.env.DATABASE_URL): Promise<Driver> {
  if (url) return createPgDriver(url);
  // In production a missing DATABASE_URL is a setup mistake: an embedded database would live on the
  // pod's disk and vanish on the next deploy. PGLITE_DIR opts in on purpose (e.g. a local `npm start`).
  if (process.env.NODE_ENV === "production" && !process.env.PGLITE_DIR) {
    throw new Error("DATABASE_URL is not set. In production the app needs Postgres.");
  }
  return createPgliteDriver(process.env.PGLITE_DIR ?? path.resolve(".data/pglite"));
}

/** The schema and the one-time data moves, as the database owner. */
async function migrate(driver: Driver): Promise<void> {
  await runSchema(driver);
  // One-time data moves that go with the schema (guarded per database in app_meta).
  const { runDataMigrations } = await import("./migrations.server");
  await runDataMigrations(driver);
}

async function init(): Promise<Driver> {
  const driver = await openDriver();
  // On Easel (MIGRATE_DATABASE_URL is set) the deploy migrates first and this role can't change tables.
  if (process.env.MIGRATE_DATABASE_URL) await requireSchema(driver);
  else await migrate(driver);
  const { bootstrapAdminFromEnv } = await import("./bootstrap.server");
  await bootstrapAdminFromEnv(driver);
  return driver;
}

/** Fails startup with a clear message when this database hasn't run the current schema and data migrations. */
export async function requireSchema(db: Pick<Driver, "query">): Promise<void> {
  const { MIGRATIONS } = await import("./migrations.server");
  const keys = [schemaVersionKey(), ...MIGRATIONS.map((m) => m.key)];
  const [meta] = await db.query<{ ok: boolean }>("SELECT to_regclass('app_meta') IS NOT NULL AS ok");
  const done = meta?.ok
    ? new Set((await db.query<{ key: string }>("SELECT key FROM app_meta WHERE key = ANY($1)", [keys])).map((r) => r.key))
    : new Set<string>();
  const missing = keys.filter((key) => !done.has(key));
  if (missing.length) {
    throw new Error(`The database schema is not up to date (missing ${missing.join(", ")}). Run npm run db:migrate first.`);
  }
}

/**
 * `npm run db:migrate`: applies the schema and data migrations, then closes
 * the connection. On Easel the deploy runs it before each update, with
 * DATABASE_URL set to the database owner's.
 */
export async function migrateDatabase(): Promise<void> {
  const driver = await openDriver();
  try {
    await migrate(driver);
  } finally {
    await driver.close();
  }
}

/**
 * Runs SCHEMA_SQL unless this database already ran this exact version. The
 * usual cold start then takes no table locks at all; a new deploy (or a new
 * database) runs the DDL once, under an advisory lock (see schemaRunSql).
 * Returns true when the DDL ran.
 */
export async function runSchema(db: Pick<Driver, "query" | "exec">): Promise<boolean> {
  const [meta] = await db.query<{ ok: boolean }>("SELECT to_regclass('app_meta') IS NOT NULL AS ok");
  if (meta?.ok) {
    const done = await db.query("SELECT 1 FROM app_meta WHERE key = $1", [schemaVersionKey()]);
    if (done.length) return false;
  }
  await db.exec(schemaRunSql());
  return true;
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

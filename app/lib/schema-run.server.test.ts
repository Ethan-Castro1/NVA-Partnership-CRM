/**
 * Running the schema at startup: the DDL runs under an advisory lock on a new
 * database, records its version in app_meta, and is skipped on later starts
 * until SCHEMA_SQL changes. Uses its own PGlite.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSchema } from "./db.server";
import { SCHEMA_LOCK_ID, SCHEMA_SQL, schemaRunSql, schemaVersionKey } from "./schema.server";

let pg: PGlite;
const db = {
  query: async <T,>(sql: string, params?: unknown[]) => (await pg.query(sql, params)).rows as T[],
  exec: async (sql: string) => {
    await pg.exec(sql);
  },
};
const versionKeys = async () =>
  (await db.query<{ key: string }>("SELECT key FROM app_meta WHERE key LIKE 'schema_sha256:%' ORDER BY key")).map((r) => r.key);

beforeAll(async () => {
  pg = await PGlite.create("memory://");
});
afterAll(async () => {
  await pg.close();
});

describe("runSchema", () => {
  it("takes the advisory lock first and records the version last", () => {
    const sql = schemaRunSql();
    expect(sql.startsWith(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_ID});`)).toBe(true);
    expect(sql).toContain(SCHEMA_SQL);
    expect(sql.indexOf(SCHEMA_SQL)).toBeLessThan(sql.indexOf(`'${schemaVersionKey()}'`));
    expect(schemaVersionKey()).toMatch(/^schema_sha256:[0-9a-f]{32}$/);
  });

  it("runs on a brand-new database and records this version", async () => {
    expect(await runSchema(db)).toBe(true);
    expect(await versionKeys()).toEqual([schemaVersionKey()]);
    // The tables are there.
    expect(await db.query("SELECT 1 FROM users LIMIT 1")).toEqual([]);
  });

  it("skips the DDL on the next start", async () => {
    expect(await runSchema(db)).toBe(false);
  });

  it("runs again when SCHEMA_SQL changed, keeping only the new version key", async () => {
    await db.query("UPDATE app_meta SET key = 'schema_sha256:older' WHERE key = $1", [schemaVersionKey()]);
    await db.query("ALTER TABLE people DROP COLUMN shared_summary");
    expect(await runSchema(db)).toBe(true);
    expect(await versionKeys()).toEqual([schemaVersionKey()]);
    // ...and the schema change was applied (the column came back).
    expect(await db.query("SELECT shared_summary FROM people LIMIT 1")).toEqual([]);
  });

  it("leaves no version key when the schema fails part way", async () => {
    await db.query("DELETE FROM app_meta WHERE key = $1", [schemaVersionKey()]);
    await db.query("ALTER TABLE people DROP COLUMN shared_summary");
    // Fails after all the DDL ran: the implicit transaction rolls back as a whole.
    const broken = schemaRunSql().replace("INSERT INTO app_meta (key) VALUES ('schema_sha256", "SELECT 1 / 0;\nINSERT INTO app_meta (key) VALUES ('schema_sha256");
    await expect(db.exec(broken)).rejects.toThrow(/division by zero/);
    expect(await versionKeys()).toEqual([]);
    const cols = await db.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'people' AND column_name = 'shared_summary'");
    expect(cols).toEqual([]);
    expect(await runSchema(db)).toBe(true);
    expect(await versionKeys()).toEqual([schemaVersionKey()]);
  });
});

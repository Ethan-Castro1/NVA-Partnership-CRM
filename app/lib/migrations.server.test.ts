/**
 * The schema and data migrations on a database shaped like one from before
 * the CRM (role 'teacher', old check constraints, 'reviewed' sign-ups),
 * run twice to prove they are idempotent. Uses its own PGlite so it can
 * recreate the old constraints.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDataMigrations, type MigrationDb } from "./migrations.server";
import { SCHEMA_SQL } from "./schema.server";

let pg: PGlite;
let db: MigrationDb;

const constraintDef = async (name: string) =>
  (
    await db.query<{ def: string }>("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1", [name])
  )[0]?.def ?? null;

beforeAll(async () => {
  pg = await PGlite.create("memory://");
  db = {
    query: async (sql, params) => (await pg.query(sql, params as unknown[] | undefined)).rows as never,
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: async (sql, params) => (await tx.query(sql, params as unknown[] | undefined)).rows as never })),
  };
  await pg.exec(SCHEMA_SQL);

  // Put the old constraints back, as a database from before the CRM had them.
  await pg.exec(`
    ALTER TABLE users DROP CONSTRAINT users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher'));
    ALTER TABLE engagements ADD CONSTRAINT engagements_kind_check
      CHECK (kind IN ('lesson', 'volunteer', 'internship', 'meeting', 'email', 'call', 'note'));
    ALTER TABLE intake_submissions ADD CONSTRAINT intake_submissions_status_check
      CHECK (status IN ('new', 'reviewed', 'archived'));
  `);
  await pg.exec(`
    INSERT INTO users (id, email, name, password_hash, role) VALUES
      ('u-admin', 'a@test', 'Ada', 'x', 'admin'), ('u-teach', 't@test', 'Tess', 'x', 'teacher');
    INSERT INTO organizations (id, name, kind) VALUES ('o-biz', 'Shop', 'business'), ('o-np', 'Garden', 'nonprofit');
    INSERT INTO people (id, full_name, status, contribution_types, affiliations, organization_id) VALUES
      ('p-active', 'Active Volunteer', 'active', '{classroom_volunteer,skills_lesson}', '{community}', 'o-biz'),
      ('p-funder', 'Active Funder', 'active', '{funder}', '{community}', NULL),
      ('p-pending', 'Pending Signup', 'active', '{internship}', '{community}', 'o-np'),
      ('p-board', 'Board Lead', 'lead', '{}', '{board}', NULL),
      ('p-new', 'New Person', 'new', '{guest_speaker}', '{community}', NULL),
      ('p-gone', 'Gone Person', 'inactive', '{}', '{community}', NULL);
    INSERT INTO intake_submissions (id, person_id, payload, status, reviewed_by, reviewed_at) VALUES
      ('s-new', 'p-pending', '{}', 'new', NULL, NULL),
      ('s-old', 'p-active', '{}', 'reviewed', 'u-admin', '2026-09-01T12:00:00Z');
    INSERT INTO engagements (id, person_id, kind, happened_on) VALUES
      ('e-lesson', 'p-active', 'lesson', '2026-09-02'), ('e-call', 'p-active', 'call', '2026-09-03'),
      ('e-email', 'p-active', 'email', '2026-09-04');
  `);
});

afterAll(async () => {
  await pg.close();
});

describe("schema and data migrations on an old database", () => {
  it("renames teacher to staff and swaps the role check, once", async () => {
    expect(await constraintDef("users_role_check")).toContain("teacher");
    await pg.exec(SCHEMA_SQL);
    await pg.exec(SCHEMA_SQL);
    expect(await constraintDef("users_role_check")).toContain("staff");
    expect(await constraintDef("users_role_check")).not.toContain("teacher");
    expect(await constraintDef("engagements_kind_check")).toBeNull();
    expect(await constraintDef("intake_submissions_status_check")).toBeNull();
    expect((await db.query<{ role: string }>("SELECT role FROM users WHERE id = 'u-teach'"))[0].role).toBe("staff");
    await expect(db.query("INSERT INTO users (id, email, name, password_hash, role) VALUES ('u-x', 'x@test', 'X', 'x', 'teacher')")).rejects.toThrow();
  });

  it("backfills visibility, categories, history and sign-up status", async () => {
    expect(await runDataMigrations(db)).toEqual(["visibility_v1", "categories_v1", "history_v1", "intake_status_v1"]);

    const people = Object.fromEntries(
      (
        await db.query<{ id: string; directory_visible: boolean; contact_mode: string; categories: string[]; approved_at: unknown }>(
          "SELECT id, directory_visible, contact_mode, categories, approved_at FROM people",
        )
      ).map((p) => [p.id, p]),
    );
    expect(people["p-active"]).toMatchObject({ directory_visible: true, contact_mode: "direct" });
    expect(people["p-active"].approved_at).toBeTruthy();
    expect(people["p-board"]).toMatchObject({ directory_visible: true, contact_mode: "direct" });
    for (const hidden of ["p-funder", "p-pending", "p-new", "p-gone"]) {
      expect(people[hidden]).toMatchObject({ directory_visible: false, contact_mode: "introduction", approved_at: null });
    }
    expect(people["p-active"].categories).toEqual(["volunteer", "skills_instructor", "business"]);
    expect(people["p-pending"].categories).toEqual(["internship_host", "community_org"]);
    expect(people["p-funder"].categories).toEqual(["funder"]);
    expect(people["p-new"].categories).toEqual(["guest_speaker"]);

    const history = Object.fromEntries(
      (await db.query<{ id: string; kind: string; visibility: string; origin: string }>("SELECT id, kind, visibility, origin FROM engagements")).map(
        (e) => [e.id, e],
      ),
    );
    expect(history["e-lesson"]).toMatchObject({ visibility: "staff", origin: "manual" });
    expect(history["e-call"]).toMatchObject({ visibility: "admin" });
    expect(history["e-email"]).toMatchObject({ kind: "email_sent", visibility: "admin", origin: "manual" });

    const intake = Object.fromEntries(
      (await db.query<{ id: string; status: string; decided_by: string | null }>("SELECT id, status, decided_by FROM intake_submissions")).map(
        (s) => [s.id, s],
      ),
    );
    expect(intake["s-old"]).toMatchObject({ status: "approved", decided_by: "u-admin" });
    expect(intake["s-new"]).toMatchObject({ status: "new", decided_by: null });
  });

  it("does nothing the second time, even after the data changes", async () => {
    await db.query("UPDATE people SET directory_visible = FALSE WHERE id = 'p-active'");
    await pg.exec(SCHEMA_SQL);
    expect(await runDataMigrations(db)).toEqual([]);
    expect((await db.query<{ v: boolean }>("SELECT directory_visible AS v FROM people WHERE id = 'p-active'"))[0].v).toBe(false);
  });

  it("adds the demo CRM rows only on SEED_DEMO deployments that have the demo people", async () => {
    const before = process.env.SEED_DEMO;
    process.env.SEED_DEMO = "true";
    try {
      // No demo people here: nothing runs and the key stays unclaimed.
      expect(await runDataMigrations(db)).toEqual([]);
      expect(await db.query("SELECT 1 FROM app_meta WHERE key = 'demo_crm_v1'")).toHaveLength(0);
    } finally {
      if (before === undefined) delete process.env.SEED_DEMO;
      else process.env.SEED_DEMO = before;
    }
  });
});

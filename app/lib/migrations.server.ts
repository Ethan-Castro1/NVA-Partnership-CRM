/**
 * One-time data moves that go with schema changes (SCHEMA_SQL only adds and
 * alters structure). Each runs once per database: its key is claimed in
 * app_meta inside the same transaction as the change, so a crash leaves
 * nothing half done and two servers starting together can't both run it.
 *
 * Runs at startup right after SCHEMA_SQL (see db.server.ts init()). It is
 * handed the raw driver because the shared query() isn't usable until startup
 * finishes. Add new migrations at the end with a new key; never edit one that
 * has shipped (databases that ran it will not run it again).
 */
import { categoriesFor } from "./constants";
import type { Queryable } from "./db.server";

export type MigrationDb = Queryable & { transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> };

type Migration = { key: string; run: (tx: Queryable) => Promise<void> };

/** Runs `run` once per database, guarded by `key` in app_meta. Returns true when it ran now. */
export async function runOnce(db: MigrationDb, key: string, run: (tx: Queryable) => Promise<void>): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx.query("INSERT INTO app_meta (key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key", [key]);
    if (!claimed.length) return false;
    await run(tx);
    return true;
  });
}

export const MIGRATIONS: Migration[] = [
  {
    // Who staff see at first: active contacts who are not funders and have no
    // sign-up waiting for review, plus board and staff. They can be contacted directly.
    key: "visibility_v1",
    run: async (tx) => {
      await tx.query(
        `UPDATE people p
            SET directory_visible = TRUE, contact_mode = 'direct', approved_at = coalesce(p.approved_at, p.created_at)
          WHERE (p.status = 'active'
                 AND NOT ('funder' = ANY (p.contribution_types))
                 AND NOT EXISTS (SELECT 1 FROM intake_submissions s WHERE s.person_id = p.id AND s.status = 'new'))
             OR p.affiliations && ARRAY['board', 'staff']::text[]`,
      );
    },
  },
  {
    // CRM categories from ways to help and organization kind (see categoriesFor in constants.ts).
    key: "categories_v1",
    run: async (tx) => {
      const rows = await tx.query<{ id: string; contribution_types: string[]; categories: string[]; kind: string | null }>(
        `SELECT p.id, p.contribution_types, p.categories, o.kind
           FROM people p LEFT JOIN organizations o ON o.id = p.organization_id`,
      );
      const updates: Record<string, string[]> = {};
      for (const row of rows) {
        const next = categoriesFor(row.contribution_types, row.kind, row.categories);
        if (next.length !== row.categories.length) updates[row.id] = next;
      }
      if (!Object.keys(updates).length) return;
      await tx.query(
        `UPDATE people p SET categories = ARRAY(SELECT jsonb_array_elements_text(v.value))
           FROM jsonb_each($1::jsonb) v WHERE p.id = v.key`,
        [JSON.stringify(updates)],
      );
    },
  },
  {
    // The history: the work itself (lessons, volunteering, internships) is
    // shared with staff; calls, meetings and notes stay admin-only. The old
    // hand-logged 'email' kind becomes 'email_sent' (still origin 'manual', so
    // it stays distinct from synced email).
    key: "history_v1",
    run: async (tx) => {
      await tx.query("UPDATE engagements SET kind = 'email_sent' WHERE kind = 'email'");
      await tx.query("UPDATE engagements SET visibility = 'staff' WHERE kind IN ('lesson', 'volunteer', 'internship')");
    },
  },
  {
    // Sign-up review: 'reviewed' became 'approved'; who decided and when carry over.
    key: "intake_status_v1",
    run: async (tx) => {
      await tx.query(
        `UPDATE intake_submissions
            SET status = 'approved', decided_by = coalesce(decided_by, reviewed_by), decided_at = coalesce(decided_at, reviewed_at)
          WHERE status = 'reviewed'`,
      );
    },
  },
];

/** The demo account and person whose presence means "this is the fictional demo database". */
export const DEMO_MARKERS = { adminEmail: "admin@nva.test", personEmail: "denise.okafor@example.org" } as const;

/** Runs every data migration not yet applied. Returns the keys that ran now. */
export async function runDataMigrations(db: MigrationDb): Promise<string[]> {
  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (await runOnce(db, migration.key, migration.run)) ran.push(migration.key);
  }
  // A live demo seeded before the CRM features gets the new demo rows once
  // (follow-ups, opportunities, requests...). Only on SEED_DEMO deployments,
  // and only when the demo people are there; a fresh demo seed adds them itself.
  if (process.env.SEED_DEMO === "true") {
    const demo = await db.query(
      `SELECT 1 FROM users u, people p WHERE u.email = $1 AND lower(p.email) = $2 LIMIT 1`,
      [DEMO_MARKERS.adminEmail, DEMO_MARKERS.personEmail],
    );
    if (demo.length) {
      const { seedDemoCrm } = await import("./demo-seed.server");
      if (await runOnce(db, "demo_crm_v1", (tx) => seedDemoCrm(tx))) ran.push("demo_crm_v1");
    }
  }
  if (ran.length) console.log(`[nva] Data migrations applied: ${ran.join(", ")}`);
  return ran;
}

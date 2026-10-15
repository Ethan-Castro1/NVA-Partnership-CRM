/**
 * Loads this semester's CAPs (app/lib/cap-catalog.ts) into the caps table,
 * and moves older demo data onto them. Runs once per database, guarded by an
 * app_meta row like the demo seed.
 */
import { CAP_TERM, SEMESTER_1_CAPS } from "./cap-catalog";
import { newId, query } from "./db.server";

export const CATALOG_META_KEY = "caps_2026_s1";

/** Old free-text demo topics, mapped to the CAP that fits best (null: no fit, dropped). */
export const OLD_TOPIC_TO_CAP: Record<string, string | null> = {
  "the bay": "streams in the balance",
  environment: "annapolis underwater",
  housing: "housing scarcity",
  "public health": "teen mental health",
  "civic engagement": "rigged or real",
  immigration: "bridges & barriers",
  transportation: "access to transportation",
  "small business": "travels of a t-shirt",
  "food access": null,
  "arts & culture": "the next act",
  "youth voice": "the next act",
  "local history": "common threads",
};

export function mapOldTopics(topics: readonly string[]): string[] {
  const out = new Set<string>();
  for (const topic of topics) {
    const mapped = topic in OLD_TOPIC_TO_CAP ? OLD_TOPIC_TO_CAP[topic] : topic;
    if (mapped) out.add(mapped);
  }
  return [...out];
}

/** Inserts the CAPs that aren't there yet (matched by title). Returns key -> CAP id. */
export async function insertCatalogCaps(ownerId: string | null): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const cap of SEMESTER_1_CAPS) {
    const existing = await query<{ id: string }>("SELECT id FROM caps WHERE lower(title) = lower($1)", [cap.title]);
    if (existing[0]) {
      ids.set(cap.key, existing[0].id);
      continue;
    }
    const id = newId();
    await query(
      `INSERT INTO caps (id, title, driving_question, description, topics, term, status, owner_id, teacher, blocks, labels, impact)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$11)`,
      [id, cap.title, cap.challenge, cap.learn, [cap.key], CAP_TERM, ownerId, cap.teacher, cap.blocks, cap.labels, cap.impact],
    );
    ids.set(cap.key, id);
  }
  return ids;
}

const OLD_DEMO_CAPS = ["Clean Creek, Healthy Bay", "Housing for All Annapolis", "Food Access in Our Neighborhood"];

/** Demo partners on catalog CAPs: [CAP key, partner email, status, note]. */
export const DEMO_CAP_PARTNERS: [string, string, "suggested" | "contacted" | "confirmed", string | null][] = [
  ["streams in the balance", "sam.whitaker@example.org", "confirmed", "Water testing with students"],
  ["streams in the balance", "naomi.fields@example.org", "contacted", null],
  ["housing scarcity", "gloria.mensah@example.org", "suggested", null],
];

export async function addDemoCapPartners(capIds: Map<string, string>, addedBy: string | null): Promise<void> {
  for (const [key, email, status, note] of DEMO_CAP_PARTNERS) {
    const capId = capIds.get(key);
    const person = (await query<{ id: string }>("SELECT id FROM people WHERE lower(email) = $1", [email]))[0];
    if (!capId || !person) continue;
    await query(
      `INSERT INTO cap_partners (cap_id, person_id, status, note, added_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING`,
      [capId, person.id, status, note, addedBy],
    );
  }
}

/**
 * For a database seeded before the catalog existed: swap the three made-up
 * demo CAPs for the real ones and map old demo topics onto them.
 */
export async function migrateDemoToCatalog(): Promise<void> {
  const claimed = await query("INSERT INTO app_meta (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key", [CATALOG_META_KEY]);
  if (!claimed.length) return;
  const admin = (await query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND active ORDER BY created_at LIMIT 1"))[0];
  await query("DELETE FROM caps WHERE title = ANY($1::text[])", [OLD_DEMO_CAPS]);
  const people = await query<{ id: string; cap_topics: string[] }>("SELECT id, cap_topics FROM people WHERE cardinality(cap_topics) > 0");
  for (const person of people) {
    const mapped = mapOldTopics(person.cap_topics);
    if (mapped.join("|") !== person.cap_topics.join("|")) {
      await query("UPDATE people SET cap_topics = $2 WHERE id = $1", [person.id, mapped]);
    }
  }
  const capIds = await insertCatalogCaps(admin?.id ?? null);
  await addDemoCapPartners(capIds, admin?.id ?? null);
  console.log(`[nva] Loaded ${capIds.size} Semester 1 CAPs.`);
}

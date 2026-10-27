/**
 * Saved resources: people a signed-in user keeps for later ("Save Resource").
 * Staff can save only people in the staff directory; admins can save anyone.
 * Lists are always filtered by what the viewer may see right now, so a person
 * hidden after being saved quietly drops out of a staff member's list.
 */
import { query, type Queryable } from "./db.server";
import { getPeopleByIds, type PersonSummary } from "./people.server";
import { canViewPerson, visiblePersonIds, type Viewer } from "./permissions.server";

export const MAX_SAVED_NOTE = 500;

export type SavedResource = PersonSummary & { saved_note: string | null; saved_at: string };

/** Saves (or re-saves, updating the note) a person the viewer can see. False when they can't see them. */
export async function savePerson(
  viewer: Viewer,
  personId: string,
  note?: string | null,
  db: Queryable = { query },
): Promise<boolean> {
  if (!(await canViewPerson(viewer, personId, db))) return false;
  const clean = note?.trim().slice(0, MAX_SAVED_NOTE) || null;
  await db.query(
    `INSERT INTO saved_resources (user_id, person_id, note) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, person_id) DO UPDATE SET note = coalesce(EXCLUDED.note, saved_resources.note)`,
    [viewer.id, personId, clean],
  );
  return true;
}

/** Removes a saved person. Always allowed: it only touches the viewer's own list. */
export async function unsavePerson(viewer: Viewer, personId: string, db: Queryable = { query }): Promise<void> {
  await db.query("DELETE FROM saved_resources WHERE user_id = $1 AND person_id = $2", [viewer.id, personId]);
}

/**
 * Sets whether the person is saved (`saved` undefined toggles). Returns the new
 * state, or null when the viewer can't see the person (nothing changes).
 */
export async function setSaved(
  viewer: Viewer,
  personId: string,
  saved?: boolean,
  note?: string | null,
): Promise<boolean | null> {
  if (!(await canViewPerson(viewer, personId))) return null;
  const want = saved ?? !(await isSaved(viewer, personId));
  if (want) await savePerson(viewer, personId, note);
  else await unsavePerson(viewer, personId);
  return want;
}

export async function isSaved(viewer: Viewer, personId: string): Promise<boolean> {
  const rows = await query("SELECT 1 FROM saved_resources WHERE user_id = $1 AND person_id = $2", [viewer.id, personId]);
  return rows.length > 0;
}

/** Which of these people the viewer has saved (for Save/Saved buttons on a list). */
export async function savedIdsAmong(viewer: Viewer, personIds: string[]): Promise<Set<string>> {
  if (!personIds.length) return new Set();
  const rows = await query<{ person_id: string }>(
    "SELECT person_id FROM saved_resources WHERE user_id = $1 AND person_id = ANY($2::text[])",
    [viewer.id, [...new Set(personIds)]],
  );
  return new Set(rows.map((r) => r.person_id));
}

/** The viewer's saved people they can still see, most recently saved first. */
export async function listSaved(viewer: Viewer, { limit = 50 }: { limit?: number } = {}): Promise<SavedResource[]> {
  const rows = await query<{ person_id: string; note: string | null; created_at: string }>(
    "SELECT person_id, note, created_at FROM saved_resources WHERE user_id = $1 ORDER BY created_at DESC, person_id LIMIT $2",
    [viewer.id, Math.min(Math.max(limit, 1), 200)],
  );
  const visible = new Set(await visiblePersonIds(viewer, rows.map((r) => r.person_id)));
  const people = new Map((await getPeopleByIds([...visible], viewer)).map((p) => [p.id, p]));
  return rows.flatMap((row) => {
    const person = people.get(row.person_id);
    return person ? [{ ...person, saved_note: row.note, saved_at: row.created_at }] : [];
  });
}

/** How many saved people the viewer can still see. */
export async function countSaved(viewer: Viewer): Promise<number> {
  const rows = await query<{ person_id: string }>("SELECT person_id FROM saved_resources WHERE user_id = $1", [viewer.id]);
  return (await visiblePersonIds(viewer, rows.map((r) => r.person_id))).length;
}

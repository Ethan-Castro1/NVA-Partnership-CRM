/**
 * A person's contact history (the engagements table): lessons taught, calls,
 * meetings, notes, emails, sign-ups, follow-ups and completed staff requests.
 *
 * Every entry says where it came from (origin) and who may see it
 * (visibility): 'staff' entries show on the staff side of a profile, 'admin'
 * entries never leave the admin side. Recording history never changes a
 * person's relationship status unless the caller asks (promoteStatus).
 */
import {
  HISTORY_KINDS,
  STAFF_VISIBLE_KINDS,
  type HistoryKind,
  type HistoryOrigin,
  type HistoryVisibility,
} from "./constants";
import { isIsoDate, schoolToday, toIsoDate } from "./dates";
import { newId, query, type Queryable } from "./db.server";
import { isAdmin, staffVisibleSql, type Viewer } from "./permissions.server";

export type HistoryEntry = {
  personId: string;
  kind: HistoryKind;
  /** Where the entry came from: typed by someone, made by the app, synced email or a staff request. */
  origin: HistoryOrigin;
  /** Who can see it: 'staff' entries show to staff on visible profiles; 'admin' entries never do. */
  visibility: HistoryVisibility;
  /** YYYY-MM-DD at the school; defaults to schoolToday(). */
  happenedOn?: string | null;
  notes?: string | null;
  /** The user who did or recorded it. */
  userId?: string | null;
  capId?: string | null;
  opportunityId?: string | null;
  followUpId?: string | null;
  staffRequestId?: string | null;
  emailMessageId?: string | null;
  meta?: Record<string, unknown>;
  /** Move a 'lead' or 'new' person to 'active'. Only when the caller means it (logging real work). */
  promoteStatus?: boolean;
};

export type HistoryView = {
  id: string;
  kind: HistoryKind;
  happened_on: string;
  notes: string | null;
  /** Who recorded it. Staff viewers don't get admins' names. */
  user_name: string | null;
  cap_id: string | null;
  cap_title: string | null;
  origin: HistoryOrigin;
  visibility: HistoryVisibility;
  /** Admin viewers only (null for staff). */
  opportunity_id: string | null;
  follow_up_id: string | null;
  email_message_id: string | null;
  /** For staff, only when the request is their own. */
  staff_request_id: string | null;
  created_at: string;
};

/** The default visibility for a kind: the work itself is shared with staff, the rest stays with admins. */
export function defaultVisibility(kind: HistoryKind): HistoryVisibility {
  return (STAFF_VISIBLE_KINDS as readonly string[]).includes(kind) ? "staff" : "admin";
}

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Adds one history entry and returns its id. For staff-request entries the
 * pair (request, person) is unique: recording it twice keeps the first entry
 * and returns its id.
 */
export async function recordHistory(entry: HistoryEntry, db: Queryable = { query }): Promise<string> {
  if (!(HISTORY_KINDS as readonly string[]).includes(entry.kind)) throw new Error(`Unknown history kind: ${entry.kind}`);
  const happenedOn = entry.happenedOn && isIsoDate(entry.happenedOn) ? entry.happenedOn : schoolToday();
  const id = newId();
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO engagements (id, person_id, user_id, cap_id, kind, happened_on, notes, origin, visibility,
                              opportunity_id, follow_up_id, staff_request_id, email_message_id, meta)
     VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      id,
      entry.personId,
      entry.userId ?? null,
      entry.capId ?? null,
      entry.kind,
      happenedOn,
      blank(entry.notes),
      entry.origin,
      entry.visibility,
      entry.opportunityId ?? null,
      entry.followUpId ?? null,
      entry.staffRequestId ?? null,
      entry.emailMessageId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ],
  );
  let entryId = inserted[0]?.id;
  if (!entryId && entry.staffRequestId) {
    const existing = await db.query<{ id: string }>(
      "SELECT id FROM engagements WHERE staff_request_id = $1 AND person_id = $2",
      [entry.staffRequestId, entry.personId],
    );
    entryId = existing[0]?.id;
  }
  if (!entryId) throw new Error("Could not record history");

  if (entry.promoteStatus === true) {
    await db.query("UPDATE people SET status = 'active', updated_at = now() WHERE id = $1 AND status IN ('lead', 'new')", [
      entry.personId,
    ]);
  }
  await db.query("UPDATE people SET updated_at = now() WHERE id = $1", [entry.personId]);
  return entryId;
}

/**
 * A person's history, newest first. Admins see everything. Staff see only
 * 'staff' entries, only for people in the staff directory, without admins'
 * names or links to opportunities, follow-ups and email.
 */
export async function listHistory(
  personId: string,
  viewer: Viewer,
  options: { limit?: number; db?: Queryable } = {},
): Promise<HistoryView[]> {
  const db = options.db ?? { query };
  const admin = isAdmin(viewer);
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const rows = await db.query<Omit<HistoryView, "happened_on" | "created_at"> & { happened_on: unknown; created_at: unknown }>(
    `SELECT e.id, e.kind, e.happened_on, e.notes,
            ${admin ? "u.name" : "CASE WHEN u.role = 'admin' THEN NULL ELSE u.name END"} AS user_name,
            e.cap_id, c.title AS cap_title, e.origin, e.visibility,
            ${admin ? "e.opportunity_id, e.follow_up_id, e.email_message_id" : "NULL::text AS opportunity_id, NULL::text AS follow_up_id, NULL::text AS email_message_id"},
            ${admin ? "e.staff_request_id" : "CASE WHEN sr.requester_id = $2 THEN e.staff_request_id END AS staff_request_id"},
            e.created_at
       FROM engagements e
       JOIN people p ON p.id = e.person_id
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN caps c ON c.id = e.cap_id
       LEFT JOIN staff_requests sr ON sr.id = e.staff_request_id
      WHERE e.person_id = $1
        ${admin ? "" : `AND e.visibility = 'staff' AND ${staffVisibleSql("p")}`}
      ORDER BY e.happened_on DESC, e.created_at DESC
      LIMIT ${limit}`,
    admin ? [personId] : [personId, viewer.id],
  );
  return rows.map((row) => ({
    ...row,
    happened_on: toIsoDate(row.happened_on) ?? "",
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

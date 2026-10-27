/**
 * Staff requests: "I need a guest speaker on healthcare", "Please introduce me
 * to Dr. Cho". Separate from the admin's opportunity pipeline.
 *
 * - Staff create requests and see and update only their own. Anyone else's
 *   request is null here (a 404 in routes), the same as a missing one.
 * - Admins see every request, assign people to it, reply and set the status.
 * - A contact of interest must be someone the requester can see.
 * - Marking a request Completed adds one `engagement_completed` history entry
 *   per person on it (the assigned people, or the contact of interest when
 *   nobody was assigned). It is idempotent (unique per request and person) and
 *   never changes anyone's relationship status.
 */
import { z } from "zod";
import {
  REQUEST_PERSON_ROLES,
  REQUEST_STATUSES,
  type RequestKind,
  type RequestPersonRole,
  type RequestStatus,
} from "./constants";
import { isIsoDate, schoolToday, toIsoDate } from "./dates";
import { newId, query, transaction, type Queryable } from "./db.server";
import { recordHistory } from "./history.server";
import { getPeopleByIds, type PersonSummary } from "./people.server";
import { canViewPerson, isAdmin, visibleToSql, type Viewer } from "./permissions.server";
import { listSaved } from "./saved.server";

export const MAX_NEED = 200;
export const MAX_DESCRIPTION = 2000;
export const MAX_SHORT = 200;
export const MAX_NOTE = 1000;
export const MAX_RESPONSE = 2000;
export const MAX_PARTICIPANTS = 1000;

/** Statuses that still need something to happen. */
export const ACTIVE_REQUEST_STATUSES: readonly RequestStatus[] = ["open", "arranged"];

export type RequestPerson = PersonSummary & { request_role: RequestPersonRole };

export type RequestView = {
  id: string;
  kind: RequestKind;
  need: string;
  description: string | null;
  cap_id: string | null;
  cap_title: string | null;
  activity: string | null;
  /** YYYY-MM-DD or null. */
  preferred_date: string | null;
  timeframe: string | null;
  participant_count: number | null;
  status: RequestStatus;
  /** The admin's reply, shown to the requester. */
  response: string | null;
  completed_note: string | null;
  requester_id: string;
  requester_name: string;
  /** The admin looking after it. */
  assigned_to: string | null;
  assigned_name: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** People on the request this viewer may see: contacts of interest and assigned people. */
  people: RequestPerson[];
};

type RequestRow = Omit<RequestView, "people" | "preferred_date" | "completed_at" | "created_at" | "updated_at"> & {
  preferred_date: unknown;
  completed_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

const stamp = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : String(v);

const COLUMNS = `r.id, r.kind, r.need, r.description, r.cap_id, c.title AS cap_title, r.activity, r.preferred_date,
  r.timeframe, r.participant_count, r.status, r.response, r.completed_note, r.requester_id, ru.name AS requester_name,
  r.assigned_to, au.name AS assigned_name, r.completed_at, r.created_at, r.updated_at`;
const FROM = `FROM staff_requests r
  JOIN users ru ON ru.id = r.requester_id
  LEFT JOIN users au ON au.id = r.assigned_to
  LEFT JOIN caps c ON c.id = r.cap_id`;

/** Attaches the people this viewer may see to each request. */
async function withPeople(viewer: Viewer, rows: RequestRow[], db: Queryable = { query }): Promise<RequestView[]> {
  if (!rows.length) return [];
  const links = await db.query<{ request_id: string; person_id: string; role: RequestPersonRole }>(
    `SELECT request_id, person_id, role FROM staff_request_people
      WHERE request_id = ANY($1::text[]) ORDER BY CASE role WHEN 'assigned' THEN 0 ELSE 1 END, created_at`,
    [rows.map((r) => r.id)],
  );
  const people = new Map((await getPeopleByIds(links.map((l) => l.person_id), viewer)).map((p) => [p.id, p]));
  return rows.map((row) => ({
    ...row,
    preferred_date: toIsoDate(row.preferred_date),
    completed_at: stamp(row.completed_at),
    created_at: stamp(row.created_at) ?? "",
    updated_at: stamp(row.updated_at) ?? "",
    people: links.flatMap((l) => {
      const person = l.request_id === row.id ? people.get(l.person_id) : undefined;
      return person ? [{ ...person, request_role: l.role }] : [];
    }),
  }));
}

export type RequestListFilter = {
  status?: RequestStatus | readonly RequestStatus[];
  kind?: RequestKind;
  /** Only requests with this person on them. */
  personId?: string;
  /** Admins: only this requester's requests. Staff always get only their own. */
  requesterId?: string;
  /** Only the viewer's own requests (also for admins). */
  mine?: boolean;
  limit?: number;
};

/**
 * Requests the viewer may see, newest first (active ones before closed ones).
 * Staff: only their own. Admins: everyone's, unless `mine` or `requesterId`.
 */
export async function listRequests(viewer: Viewer, filter: RequestListFilter = {}): Promise<RequestView[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (n: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (!isAdmin(viewer) || filter.mine) add((n) => `r.requester_id = ${n}`, viewer.id);
  else if (filter.requesterId) add((n) => `r.requester_id = ${n}`, filter.requesterId);
  if (filter.status) {
    const statuses = (Array.isArray(filter.status) ? filter.status : [filter.status]).filter((s) =>
      (REQUEST_STATUSES as readonly string[]).includes(s),
    );
    add((n) => `r.status = ANY(${n}::text[])`, statuses);
  }
  if (filter.kind) add((n) => `r.kind = ${n}`, filter.kind);
  if (filter.personId) {
    if (!(await canViewPerson(viewer, filter.personId))) return [];
    add((n) => `EXISTS (SELECT 1 FROM staff_request_people sp WHERE sp.request_id = r.id AND sp.person_id = ${n})`, filter.personId);
  }
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  const rows = await query<RequestRow>(
    `SELECT ${COLUMNS} ${FROM}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'arranged' THEN 1 ELSE 2 END,
               CASE WHEN r.status IN ('completed', 'canceled') THEN r.updated_at END DESC NULLS LAST,
               r.created_at DESC
      LIMIT ${limit}`,
    params,
  );
  return withPeople(viewer, rows);
}

/** The requests with this person on them that the viewer may see (for a profile's "Requests" panel). */
export async function listRequestsForPerson(viewer: Viewer, personId: string, limit = 50): Promise<RequestView[]> {
  return listRequests(viewer, { personId, limit });
}

/** The bare request row (no people), scoped like getRequest. Safe inside a transaction. */
async function getRequestRow(viewer: Viewer, id: string, db: Queryable): Promise<RequestRow | null> {
  if (!id || id.length > 100) return null;
  const rows = await db.query<RequestRow>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.id = $1 ${isAdmin(viewer) ? "" : "AND r.requester_id = $2"}`,
    isAdmin(viewer) ? [id] : [id, viewer.id],
  );
  return rows[0] ?? null;
}

/** One request, or null when it doesn't exist or isn't the viewer's (staff). */
export async function getRequest(viewer: Viewer, id: string): Promise<RequestView | null> {
  const row = await getRequestRow(viewer, id, { query });
  return row ? ((await withPeople(viewer, [row]))[0] ?? null) : null;
}

// ---------- the form ----------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "requests.error.tooLong")
    .transform((v) => v || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const requestInputSchema = z.object({
  need: z.string().trim().min(1, "requests.error.needRequired").max(MAX_NEED, "requests.error.tooLong"),
  description: optionalText(MAX_DESCRIPTION),
  capId: optionalText(100),
  activity: optionalText(MAX_SHORT),
  preferredDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || isIsoDate(v), "requests.error.badDate"),
  timeframe: optionalText(MAX_SHORT),
  participantCount: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= MAX_PARTICIPANTS), "requests.error.badCount"),
  /** The contact of interest (optional). */
  personId: optionalText(100),
  /** Ask for an introduction to that contact. */
  intro: z.boolean().optional().default(false),
});

export type RequestInput = z.input<typeof requestInputSchema>;
type CleanInput = z.output<typeof requestInputSchema>;

export type RequestErrorKey =
  | "requests.error.needRequired"
  | "requests.error.tooLong"
  | "requests.error.badDate"
  | "requests.error.badCount"
  | "requests.error.personNotFound"
  | "requests.error.introNeedsPerson"
  | "requests.error.capNotFound";
export type RequestField = "need" | "description" | "capId" | "activity" | "preferredDate" | "timeframe" | "participantCount" | "personId";
export type RequestErrors = Partial<Record<RequestField, RequestErrorKey>>;

export type RequestResult = { ok: true; id: string } | { ok: false; errors: RequestErrors };

/** Reads the request form (field names match RequestInput; intro is a checkbox "1"/"on"). */
export function requestInputFromForm(form: FormData): RequestInput {
  const text = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : null;
  };
  const cap = text("capId");
  return {
    need: text("need") ?? "",
    description: text("description"),
    capId: cap === "none" ? null : cap,
    activity: text("activity"),
    preferredDate: text("preferredDate"),
    timeframe: text("timeframe"),
    participantCount: text("participantCount"),
    personId: text("personId") === "none" ? null : text("personId"),
    intro: ["1", "on", "true"].includes(text("intro") ?? ""),
  };
}

async function validate(viewer: Viewer, input: RequestInput, db: Queryable): Promise<{ ok: true; value: CleanInput } | { ok: false; errors: RequestErrors }> {
  const parsed = requestInputSchema.safeParse(input);
  const errors: RequestErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as RequestField;
      errors[field] ??= issue.message as RequestErrorKey;
    }
    return { ok: false, errors };
  }
  const value = parsed.data;
  if (value.personId && !(await canViewPerson(viewer, value.personId, db))) errors.personId = "requests.error.personNotFound";
  if (value.intro && !value.personId) errors.personId = "requests.error.introNeedsPerson";
  if (value.capId) {
    const cap = await db.query("SELECT 1 FROM caps WHERE id = $1", [value.capId]);
    if (!cap.length) errors.capId = "requests.error.capNotFound";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Creates a request from the viewer. A contact of interest must be someone the viewer can see. */
export async function createRequest(viewer: Viewer, input: RequestInput): Promise<RequestResult> {
  return transaction(async (tx) => {
    const checked = await validate(viewer, input, tx);
    if (!checked.ok) return checked;
    const v = checked.value;
    const id = newId();
    await tx.query(
      `INSERT INTO staff_requests (id, requester_id, kind, need, description, cap_id, activity, preferred_date, timeframe, participant_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10)`,
      [id, viewer.id, v.intro && v.personId ? "introduction" : "resource", v.need, v.description, v.capId, v.activity,
        v.preferredDate, v.timeframe, v.participantCount],
    );
    if (v.personId) {
      await tx.query(
        "INSERT INTO staff_request_people (request_id, person_id, role, added_by) VALUES ($1,$2,'interest',$3) ON CONFLICT DO NOTHING",
        [id, v.personId, viewer.id],
      );
    }
    return { ok: true, id };
  });
}

/**
 * Edits a request's details (what, when, how many). The requester can edit
 * their own while it is open or arranged; admins can edit any. Null when the
 * viewer may not see it. The contact of interest is set at creation and by
 * admins (assignPerson), so it is not changed here.
 */
export async function updateRequestDetails(
  viewer: Viewer,
  id: string,
  input: Omit<RequestInput, "personId" | "intro">,
): Promise<RequestResult | null> {
  const current = await getRequest(viewer, id);
  if (!current) return null;
  if (!isAdmin(viewer) && !ACTIVE_REQUEST_STATUSES.includes(current.status)) return { ok: false, errors: {} };
  const checked = await validate(viewer, { ...input, personId: null, intro: false }, { query });
  if (!checked.ok) return checked;
  const v = checked.value;
  await query(
    `UPDATE staff_requests SET need = $2, description = $3, cap_id = $4, activity = $5, preferred_date = $6::date,
            timeframe = $7, participant_count = $8, updated_at = now()
      WHERE id = $1`,
    [id, v.need, v.description, v.capId, v.activity, v.preferredDate, v.timeframe, v.participantCount],
  );
  return { ok: true, id };
}

// ---------- status ----------

export type StatusChange = {
  status: RequestStatus;
  /** A short note when completing ("Students loved it"). Saved on the request and in the history entries. */
  note?: string | null;
};

export type StatusResult =
  | { ok: true; status: RequestStatus; historyIds: string[] }
  | { ok: false; error: "not_found" | "invalid" | "locked" };

/** The people a completion is recorded for: the assigned people, or the contacts of interest when nobody was assigned. */
async function completionPeople(requestId: string, db: Queryable): Promise<string[]> {
  const rows = await db.query<{ person_id: string; role: RequestPersonRole }>(
    "SELECT person_id, role FROM staff_request_people WHERE request_id = $1 ORDER BY created_at",
    [requestId],
  );
  const assigned = rows.filter((r) => r.role === "assigned").map((r) => r.person_id);
  return assigned.length ? assigned : rows.map((r) => r.person_id);
}

/**
 * Changes a request's status. Staff: only their own, and a completed request
 * stays completed (an admin can reopen it). Completing records the engagement
 * in each person's history once (re-completing adds nothing) and never
 * changes anyone's relationship status.
 */
export async function setRequestStatus(viewer: Viewer, id: string, change: StatusChange): Promise<StatusResult> {
  if (!(REQUEST_STATUSES as readonly string[]).includes(change.status)) return { ok: false, error: "invalid" };
  const note = change.note?.trim().slice(0, MAX_NOTE) || null;
  return transaction(async (tx) => {
    const current = await getRequestRow(viewer, id, tx);
    if (!current) return { ok: false, error: "not_found" } as const;
    const preferredDate = toIsoDate(current.preferred_date);
    if (!isAdmin(viewer) && current.status === "completed" && change.status !== "completed") {
      return { ok: false, error: "locked" } as const;
    }
    const completing = change.status === "completed";
    await tx.query(
      `UPDATE staff_requests
          SET status = $2,
              completed_note = CASE WHEN $3::boolean THEN coalesce($4, completed_note) ELSE completed_note END,
              completed_at = CASE WHEN $3::boolean THEN coalesce(completed_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE id = $1`,
      [id, change.status, completing, note],
    );
    const historyIds: string[] = [];
    if (completing) {
      const today = schoolToday();
      const happenedOn = preferredDate && preferredDate <= today ? preferredDate : today;
      for (const personId of await completionPeople(id, tx)) {
        historyIds.push(
          await recordHistory(
            {
              personId,
              kind: "engagement_completed",
              origin: "staff_request",
              visibility: "staff",
              userId: current.requester_id,
              capId: current.cap_id,
              staffRequestId: id,
              happenedOn,
              notes: note ?? current.completed_note ?? current.need,
              meta: { request_kind: current.kind, need: current.need, completed_by: viewer.id },
            },
            tx,
          ),
        );
      }
    }
    return { ok: true, status: change.status, historyIds } as const;
  });
}

// ---------- admin ----------

export type AdminUpdate = {
  status?: RequestStatus;
  note?: string | null;
  /** Reply shown to the requester. Undefined keeps it; "" clears it. */
  response?: string | null;
  /** The admin looking after it. Undefined keeps it; null clears it. */
  assignedTo?: string | null;
};

/** Admin: reply, set who looks after it, and change the status (completing records history as above). */
export async function adminUpdateRequest(viewer: Viewer, id: string, update: AdminUpdate): Promise<StatusResult> {
  if (!isAdmin(viewer)) return { ok: false, error: "not_found" };
  const current = await getRequest(viewer, id);
  if (!current) return { ok: false, error: "not_found" };
  if (update.assignedTo) {
    const admin = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'admin'", [update.assignedTo]);
    if (!admin.length) return { ok: false, error: "invalid" };
  }
  if (update.response !== undefined || update.assignedTo !== undefined) {
    await query(
      `UPDATE staff_requests
          SET response = CASE WHEN $2::boolean THEN $3 ELSE response END,
              assigned_to = CASE WHEN $4::boolean THEN $5 ELSE assigned_to END,
              updated_at = now()
        WHERE id = $1`,
      [
        id,
        update.response !== undefined,
        update.response?.trim().slice(0, MAX_RESPONSE) || null,
        update.assignedTo !== undefined,
        update.assignedTo || null,
      ],
    );
  }
  if (update.status && (update.status !== current.status || (update.status === "completed" && update.note))) {
    return setRequestStatus(viewer, id, { status: update.status, note: update.note });
  }
  return { ok: true, status: current.status, historyIds: [] };
}

/** Admin: puts a person on a request (assigned by default). False when not allowed or not found. */
export async function assignPerson(
  viewer: Viewer,
  requestId: string,
  personId: string,
  role: RequestPersonRole = "assigned",
): Promise<boolean> {
  if (!isAdmin(viewer) || !(REQUEST_PERSON_ROLES as readonly string[]).includes(role)) return false;
  if (!(await getRequest(viewer, requestId)) || !(await canViewPerson(viewer, personId))) return false;
  await query(
    `INSERT INTO staff_request_people (request_id, person_id, role, added_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (request_id, person_id) DO UPDATE SET role = EXCLUDED.role, added_by = EXCLUDED.added_by`,
    [requestId, personId, role, viewer.id],
  );
  await query("UPDATE staff_requests SET updated_at = now() WHERE id = $1", [requestId]);
  return true;
}

/** Admin: takes a person off a request (their history entries, if any, stay). */
export async function removePerson(viewer: Viewer, requestId: string, personId: string): Promise<boolean> {
  if (!isAdmin(viewer)) return false;
  const rows = await query("DELETE FROM staff_request_people WHERE request_id = $1 AND person_id = $2 RETURNING person_id", [
    requestId,
    personId,
  ]);
  return rows.length > 0;
}

/** The admins (for "Looked after by"). Admin only. */
export async function listAdmins(viewer: Viewer): Promise<{ id: string; name: string }[]> {
  if (!isAdmin(viewer)) return [];
  return query<{ id: string; name: string }>("SELECT id, name FROM users WHERE role = 'admin' ORDER BY name");
}

export type RequestAttention = {
  /** Open requests of any kind (staff requests requiring assistance). */
  open: number;
  /** Open introduction requests (always need an admin). */
  introductions: number;
  /** The open requests, introductions first, oldest first (up to `limit`). */
  items: RequestView[];
};

/**
 * Admin dashboard: open staff requests that need someone, introductions first.
 * Empty for staff.
 */
export async function getRequestAttention(viewer: Viewer, { limit = 5 }: { limit?: number } = {}): Promise<RequestAttention> {
  if (!isAdmin(viewer)) return { open: 0, introductions: 0, items: [] };
  const [counts] = await query<{ open: number; introductions: number }>(
    `SELECT count(*)::int AS open, count(*) FILTER (WHERE kind = 'introduction')::int AS introductions
       FROM staff_requests WHERE status = 'open'`,
  );
  const rows = await query<RequestRow>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.status = 'open'
      ORDER BY CASE r.kind WHEN 'introduction' THEN 0 ELSE 1 END, r.created_at
      LIMIT ${Math.min(Math.max(limit, 1), 50)}`,
  );
  return { open: counts?.open ?? 0, introductions: counts?.introductions ?? 0, items: await withPeople(viewer, rows) };
}

/** Number of open introduction requests (admin dashboard badge). 0 for staff. */
export async function countIntroductionsNeedingAttention(viewer: Viewer): Promise<number> {
  return (await getRequestAttention(viewer, { limit: 1 })).introductions;
}

/**
 * Staff dashboard: the viewer's own requests that are still active (open or
 * arranged), soonest preferred date first.
 */
export async function listMyActiveRequests(viewer: Viewer, limit = 5): Promise<RequestView[]> {
  const rows = await listRequests(viewer, { mine: true, status: ACTIVE_REQUEST_STATUSES, limit: 100 });
  return rows
    .sort((a, b) => (a.preferred_date ?? "9999").localeCompare(b.preferred_date ?? "9999") || b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** Arranged requests of the viewer's (admins: everyone's) with a preferred date today or later. */
export async function listUpcomingArranged(viewer: Viewer, limit = 5): Promise<RequestView[]> {
  const today = schoolToday();
  const rows = await listRequests(viewer, { status: "arranged", limit: 200 });
  return rows
    .filter((r) => r.preferred_date && r.preferred_date >= today)
    .sort((a, b) => (a.preferred_date ?? "").localeCompare(b.preferred_date ?? ""))
    .slice(0, limit);
}

// ---------- options for the form ----------

export type PersonOption = { id: string; full_name: string; organization_name: string | null };

/** People the viewer may pick as a contact of interest (staff: the staff directory). */
export async function listPersonOptions(viewer: Viewer): Promise<PersonOption[]> {
  return query<PersonOption>(
    `SELECT p.id, p.full_name, o.name AS organization_name
       FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE ${visibleToSql(viewer, "p")} AND p.status <> 'inactive'
      ORDER BY lower(p.full_name) LIMIT 2000`,
  );
}

export type CapOption = { id: string; title: string };

/** CAPs that are not finished, for "Related CAP". */
export async function listCapOptions(): Promise<CapOption[]> {
  return query<CapOption>("SELECT id, title FROM caps WHERE status <> 'complete' ORDER BY title");
}

// ---------- My Connections ----------

export type MyConnection = PersonSummary & {
  saved: boolean;
  /** On one of the viewer's requests (any status but canceled). */
  requested: boolean;
  /** On one of the viewer's completed requests. */
  worked_with: boolean;
  /** The most recent of the viewer's requests with this person. */
  last_request_id: string | null;
  last_request_need: string | null;
  /** When the viewer last saved, requested or worked with them. */
  last_at: string;
};

/**
 * People the viewer saved, requested or worked with (completed requests),
 * most recent first. Only people the viewer can see right now.
 */
export async function listMyConnections(viewer: Viewer): Promise<MyConnection[]> {
  const saved = await listSaved(viewer, { limit: 200 });
  const links = await query<{ person_id: string; status: RequestStatus; request_id: string; need: string; at: unknown }>(
    `SELECT sp.person_id, r.status, r.id AS request_id, r.need, greatest(r.updated_at, sp.created_at) AS at
       FROM staff_request_people sp JOIN staff_requests r ON r.id = sp.request_id
      WHERE r.requester_id = $1 AND r.status <> 'canceled'
      ORDER BY at DESC`,
    [viewer.id],
  );
  const byId = new Map<string, MyConnection>();
  for (const person of saved) {
    const { saved_note: _note, saved_at, ...rest } = person;
    byId.set(person.id, {
      ...rest, saved: true, requested: false, worked_with: false, last_request_id: null, last_request_need: null,
      last_at: stamp(saved_at) ?? "",
    });
  }
  const requestPeople = new Map(
    (await getPeopleByIds(links.map((l) => l.person_id).filter((id) => !byId.has(id)), viewer)).map((p) => [p.id, p]),
  );
  for (const link of links) {
    let entry = byId.get(link.person_id);
    if (!entry) {
      const person = requestPeople.get(link.person_id);
      if (!person) continue;
      entry = { ...person, saved: false, requested: false, worked_with: false, last_request_id: null, last_request_need: null, last_at: "" };
      byId.set(person.id, entry);
    }
    const at = stamp(link.at) ?? "";
    entry.requested = true;
    if (link.status === "completed") entry.worked_with = true;
    if (!entry.last_request_id) {
      entry.last_request_id = link.request_id;
      entry.last_request_need = link.need;
    }
    if (at > entry.last_at) entry.last_at = at;
  }
  return [...byId.values()].sort((a, b) => b.last_at.localeCompare(a.last_at) || a.full_name.localeCompare(b.full_name));
}


/**
 * Follow-ups: the admin's to-do list of contacts ("Send Jordan the internship
 * information, due Oct 22"). Reminders live inside the app only; nothing is
 * ever emailed.
 *
 * Admin only: every function takes the viewer and throws a 403 for staff.
 * "Today" is the school's date (schoolToday()), passed into SQL as a parameter.
 *
 * Views (exclusive, so each open follow-up shows in one place):
 * - awaiting: open and waiting on the other person's reply (any due date)
 * - overdue: open, not awaiting, due before today
 * - today: open, not awaiting, due today
 * - upcoming: open, not awaiting, due after today
 * - completed: done
 * Canceled follow-ups are in no view.
 */
import { z } from "zod";
import { FOLLOW_UP_VIEWS, type FollowUpStatus, type FollowUpView } from "./constants";
import { isIsoDate, schoolToday, toIsoDate } from "./dates";
import { newId, query, transaction, type Queryable } from "./db.server";
import { recordHistory } from "./history.server";
import { assertAdmin, listOpportunities, listCrmOwners, type CrmActor, type NamedOption, type OpportunityView } from "./opportunities.server";
import type { Viewer } from "./permissions.server";

export type FollowUpItem = {
  id: string;
  person_id: string;
  person_name: string;
  organization_name: string | null;
  opportunity_id: string | null;
  opportunity_title: string | null;
  action: string;
  /** YYYY-MM-DD */
  due_on: string;
  owner_user_id: string | null;
  owner_name: string | null;
  status: FollowUpStatus;
  awaiting_response: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
  created_at: string;
  /** Which view it falls in today (null when canceled). */
  view: FollowUpView | null;
};

/** The view a follow-up belongs in on `today` (YYYY-MM-DD). Pure: the same rule the SQL uses. */
export function followUpView(
  item: { status: string; due_on: string; awaiting_response: boolean },
  today: string,
): FollowUpView | null {
  if (item.status === "completed") return "completed";
  if (item.status !== "open") return null;
  if (item.awaiting_response) return "awaiting";
  if (item.due_on < today) return "overdue";
  if (item.due_on === today) return "today";
  return "upcoming";
}

/** SQL for one view; `$1` is today. */
const VIEW_SQL: Record<FollowUpView, string> = {
  awaiting: "(f.status = 'open' AND f.awaiting_response)",
  overdue: "(f.status = 'open' AND NOT f.awaiting_response AND f.due_on < $1::date)",
  today: "(f.status = 'open' AND NOT f.awaiting_response AND f.due_on = $1::date)",
  upcoming: "(f.status = 'open' AND NOT f.awaiting_response AND f.due_on > $1::date)",
  completed: "(f.status = 'completed')",
};

export type FollowUpFilter = {
  /** One view or several; default: every open view (overdue, today, upcoming, awaiting). */
  views?: FollowUpView | FollowUpView[];
  personId?: string;
  opportunityId?: string;
  ownerUserId?: string;
  /** Defaults to schoolToday(). */
  today?: string;
  limit?: number;
};

type Row = Omit<FollowUpItem, "due_on" | "completed_at" | "created_at" | "view"> & {
  due_on: unknown;
  completed_at: unknown;
  created_at: unknown;
};

const ts = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

function viewsOf(filter: FollowUpFilter): FollowUpView[] {
  const views = filter.views === undefined ? ["overdue", "today", "upcoming", "awaiting"] : [filter.views].flat();
  return FOLLOW_UP_VIEWS.filter((v) => views.includes(v));
}

/**
 * Follow-ups in the chosen views. Open ones come soonest first (overdue at the
 * top); completed ones most recently done first.
 */
export async function listFollowUps(viewer: Viewer, filter: FollowUpFilter = {}): Promise<FollowUpItem[]> {
  assertAdmin(viewer);
  const today = filter.today && isIsoDate(filter.today) ? filter.today : schoolToday();
  const views = viewsOf(filter);
  if (!views.length) return [];
  const params: unknown[] = [today];
  // `$1::date IS NOT NULL` types $1 even when no chosen view compares dates.
  const where = [`(${views.map((v) => VIEW_SQL[v]).join(" OR ")})`, "$1::date IS NOT NULL"];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (filter.personId) add("f.person_id = ?", filter.personId);
  if (filter.opportunityId) add("f.opportunity_id = ?", filter.opportunityId);
  if (filter.ownerUserId) add("f.owner_user_id = ?", filter.ownerUserId);
  const limit = Math.min(Math.max(filter.limit ?? 300, 1), 1000);
  const rows = await query<Row>(
    `SELECT f.id, f.person_id, p.full_name AS person_name, org.name AS organization_name,
            f.opportunity_id, o.title AS opportunity_title, f.action, f.due_on, f.owner_user_id, u.name AS owner_name,
            f.status, f.awaiting_response, f.completed_at, cu.name AS completed_by_name, f.created_at
       FROM follow_ups f
       JOIN people p ON p.id = f.person_id
       LEFT JOIN organizations org ON org.id = p.organization_id
       LEFT JOIN opportunities o ON o.id = f.opportunity_id
       LEFT JOIN users u ON u.id = f.owner_user_id
       LEFT JOIN users cu ON cu.id = f.completed_by
      WHERE ${where.join(" AND ")}
      ORDER BY (f.status = 'open') DESC,
               CASE WHEN f.status = 'open' THEN f.due_on END ASC,
               f.completed_at DESC NULLS LAST, f.created_at DESC
      LIMIT ${limit}`,
    params,
  );
  return rows.map((r) => {
    const item = {
      ...r,
      due_on: toIsoDate(r.due_on) ?? "",
      completed_at: r.completed_at ? ts(r.completed_at) : null,
      created_at: ts(r.created_at),
    };
    return { ...item, view: followUpView(item, today) };
  });
}

/** How many follow-ups are in each view today (for tabs and dashboard tiles). */
export async function countFollowUps(
  viewer: Viewer,
  filter: Pick<FollowUpFilter, "ownerUserId" | "personId" | "today"> = {},
): Promise<Record<FollowUpView, number>> {
  assertAdmin(viewer);
  const today = filter.today && isIsoDate(filter.today) ? filter.today : schoolToday();
  const params: unknown[] = [today];
  const where: string[] = [];
  if (filter.ownerUserId) {
    params.push(filter.ownerUserId);
    where.push(`f.owner_user_id = $${params.length}`);
  }
  if (filter.personId) {
    params.push(filter.personId);
    where.push(`f.person_id = $${params.length}`);
  }
  const rows = await query<Record<FollowUpView, number>>(
    `SELECT ${FOLLOW_UP_VIEWS.map((v) => `count(*) FILTER (WHERE ${VIEW_SQL[v]})::int AS ${v}`).join(", ")}
       FROM follow_ups f ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    params,
  );
  const row = rows[0];
  return Object.fromEntries(FOLLOW_UP_VIEWS.map((v) => [v, row?.[v] ?? 0])) as Record<FollowUpView, number>;
}

// ---------- writes ----------

export type FollowUpInput = {
  personId: string;
  action: string;
  /** YYYY-MM-DD */
  dueOn: string;
  opportunityId?: string | null;
  /** Defaults to the actor. */
  ownerUserId?: string | null;
  awaitingResponse?: boolean;
};

export class FollowUpInputError extends Error {}

/** Checks the person, the opportunity (must be the same person's) and the owner. */
async function checkRefs(db: Queryable, input: FollowUpInput): Promise<void> {
  if (!input.action.trim()) throw new FollowUpInputError("action");
  if (!isIsoDate(input.dueOn)) throw new FollowUpInputError("dueOn");
  if (!(await db.query("SELECT 1 FROM people WHERE id = $1", [input.personId])).length) throw new FollowUpInputError("person");
  if (input.opportunityId) {
    const opp = await db.query<{ person_id: string | null }>("SELECT person_id FROM opportunities WHERE id = $1", [input.opportunityId]);
    if (!opp[0] || (opp[0].person_id && opp[0].person_id !== input.personId)) throw new FollowUpInputError("opportunity");
  }
  if (input.ownerUserId && !(await db.query("SELECT 1 FROM users WHERE id = $1", [input.ownerUserId])).length) {
    throw new FollowUpInputError("owner");
  }
}

async function insertFollowUp(db: Queryable, actor: CrmActor, input: FollowUpInput): Promise<string> {
  await checkRefs(db, input);
  const id = newId();
  const action = input.action.trim();
  await db.query(
    `INSERT INTO follow_ups (id, person_id, opportunity_id, action, due_on, owner_user_id, awaiting_response, created_by)
     VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8)`,
    [id, input.personId, input.opportunityId || null, action, input.dueOn, input.ownerUserId || actor.id, input.awaitingResponse ?? false, actor.id],
  );
  await recordHistory(
    {
      personId: input.personId, kind: "follow_up_scheduled", origin: "manual", visibility: "admin", userId: actor.id,
      followUpId: id, opportunityId: input.opportunityId || null, notes: action, meta: { due_on: input.dueOn },
    },
    db,
  );
  return id;
}

/** Adds a follow-up (and a history entry). Returns its id. */
export async function createFollowUp(actor: CrmActor, input: FollowUpInput): Promise<string> {
  assertAdmin(actor);
  return transaction((tx) => insertFollowUp(tx, actor, input));
}

type OpenRow = { person_id: string; opportunity_id: string | null; action: string; owner_user_id: string | null; status: string };

async function lockFollowUp(db: Queryable, id: string): Promise<OpenRow> {
  const row = (await db.query<OpenRow>(
    "SELECT person_id, opportunity_id, action, owner_user_id, status FROM follow_ups WHERE id = $1 FOR UPDATE",
    [id],
  ))[0];
  if (!row) throw new Response("Not found", { status: 404 });
  return row;
}

/**
 * Marks a follow-up done (records it in history). With `next`, also adds the
 * next follow-up for the same person and opportunity, in the same step.
 * Completing one that is already done changes nothing.
 */
export async function completeFollowUp(
  actor: CrmActor,
  id: string,
  options: { note?: string | null; next?: Pick<FollowUpInput, "action" | "dueOn"> & { ownerUserId?: string | null; awaitingResponse?: boolean } } = {},
): Promise<{ completed: boolean; nextId: string | null }> {
  assertAdmin(actor);
  return transaction(async (tx) => {
    const row = await lockFollowUp(tx, id);
    let completed = false;
    if (row.status === "open") {
      await tx.query(
        `UPDATE follow_ups SET status = 'completed', completed_at = now(), completed_by = $2, awaiting_response = FALSE,
                               updated_at = now()
          WHERE id = $1`,
        [id, actor.id],
      );
      const note = options.note?.trim();
      await recordHistory(
        {
          personId: row.person_id, kind: "follow_up_completed", origin: "manual", visibility: "admin", userId: actor.id,
          followUpId: id, opportunityId: row.opportunity_id, notes: note ? `${row.action}. ${note}` : row.action,
        },
        tx,
      );
      completed = true;
    }
    let nextId: string | null = null;
    if (options.next) {
      nextId = await insertFollowUp(tx, actor, {
        personId: row.person_id,
        opportunityId: row.opportunity_id,
        action: options.next.action,
        dueOn: options.next.dueOn,
        ownerUserId: options.next.ownerUserId ?? row.owner_user_id,
        awaitingResponse: options.next.awaitingResponse,
      });
    }
    return { completed, nextId };
  });
}

/** Moves an open follow-up to another day. */
export async function rescheduleFollowUp(actor: CrmActor, id: string, dueOn: string): Promise<void> {
  assertAdmin(actor);
  if (!isIsoDate(dueOn)) throw new FollowUpInputError("dueOn");
  await transaction(async (tx) => {
    const row = await lockFollowUp(tx, id);
    if (row.status !== "open") throw new FollowUpInputError("status");
    await tx.query("UPDATE follow_ups SET due_on = $2::date, updated_at = now() WHERE id = $1", [id, dueOn]);
  });
}

/** Marks an open follow-up as waiting on the other person's reply (or not). */
export async function setAwaitingResponse(actor: CrmActor, id: string, awaiting: boolean): Promise<void> {
  assertAdmin(actor);
  await transaction(async (tx) => {
    const row = await lockFollowUp(tx, id);
    if (row.status !== "open") throw new FollowUpInputError("status");
    await tx.query("UPDATE follow_ups SET awaiting_response = $2, updated_at = now() WHERE id = $1", [id, awaiting]);
  });
}

/** Cancels an open follow-up (it leaves every view). */
export async function cancelFollowUp(actor: CrmActor, id: string): Promise<void> {
  assertAdmin(actor);
  await transaction(async (tx) => {
    const row = await lockFollowUp(tx, id);
    if (row.status !== "open") return;
    await tx.query("UPDATE follow_ups SET status = 'canceled', updated_at = now() WHERE id = $1", [id]);
  });
}

// ---------- profile panels ----------

export type PersonCrm = {
  today: string;
  opportunities: OpportunityView[];
  followUps: FollowUpItem[];
  owners: NamedOption[];
};

/**
 * Everything the profile's CRM panels need for one person: all their
 * opportunities, their open follow-ups plus the last few completed, and the
 * owners to pick from. Admin only (staff get a 403: don't call it for them).
 */
export async function getPersonCrm(viewer: Viewer, personId: string, options: { today?: string } = {}): Promise<PersonCrm> {
  assertAdmin(viewer);
  const today = options.today && isIsoDate(options.today) ? options.today : schoolToday();
  const [opportunities, open, done, owners] = await Promise.all([
    listOpportunities(viewer, { personId, state: "all" }),
    listFollowUps(viewer, { personId, today }),
    listFollowUps(viewer, { personId, today, views: "completed", limit: 5 }),
    listCrmOwners(viewer),
  ]);
  return { today, opportunities, followUps: [...open, ...done], owners };
}

// ---------- form parsing (the /app/follow-ups/action resource route) ----------

export type FollowUpFormErrors = Partial<
  Record<"personId" | "action" | "dueOn" | "opportunityId" | "ownerUserId", "crm.error.personRequired" | "crm.error.actionRequired" | "crm.error.tooLong" | "crm.error.badDate">
>;

const idField = z.string().trim().max(100).transform((v) => (v && v !== "none" ? v : null));

const followUpSchema = z.object({
  personId: z.string().trim().min(1, "crm.error.personRequired").max(100, "crm.error.personRequired"),
  action: z.string().trim().min(1, "crm.error.actionRequired").max(500, "crm.error.tooLong"),
  dueOn: z.string().trim().refine(isIsoDate, "crm.error.badDate"),
  opportunityId: idField,
  ownerUserId: idField,
  awaitingResponse: z.boolean(),
});

const str = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};
const checked = (form: FormData, name: string) => ["on", "true", "1"].includes(str(form, name));

/** Reads a new follow-up (fields personId, action, dueOn, opportunityId, ownerUserId, awaitingResponse). */
export function parseFollowUpForm(form: FormData): { ok: true; value: FollowUpInput } | { ok: false; errors: FollowUpFormErrors } {
  const parsed = followUpSchema.safeParse({
    personId: str(form, "personId"),
    action: str(form, "action"),
    dueOn: str(form, "dueOn"),
    opportunityId: str(form, "opportunityId"),
    ownerUserId: str(form, "ownerUserId"),
    awaitingResponse: checked(form, "awaitingResponse"),
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: FollowUpFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof FollowUpFormErrors;
    errors[field] ??= issue.message as FollowUpFormErrors[keyof FollowUpFormErrors];
  }
  return { ok: false, errors };
}

export type NextFollowUpErrors = Partial<Record<"nextAction" | "nextDueOn", "crm.error.actionRequired" | "crm.error.tooLong" | "crm.error.badDate">>;

/** Reads the optional "next follow-up" part of the complete form (nextAction, nextDueOn). Null when both are empty. */
export function parseNextFollowUp(
  form: FormData,
): { ok: true; value: { action: string; dueOn: string } | null } | { ok: false; errors: NextFollowUpErrors } {
  const action = str(form, "nextAction").trim();
  const dueOn = str(form, "nextDueOn").trim();
  if (!action && !dueOn) return { ok: true, value: null };
  const errors: NextFollowUpErrors = {};
  if (!action) errors.nextAction = "crm.error.actionRequired";
  else if (action.length > 500) errors.nextAction = "crm.error.tooLong";
  if (!isIsoDate(dueOn)) errors.nextDueOn = "crm.error.badDate";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { action, dueOn } };
}

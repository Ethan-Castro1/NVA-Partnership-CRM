/**
 * Opportunities: one possible piece of work or funding with one person
 * (a workshop, an internship, a grant). A person can have many. Engagement
 * and funding are separate tracks with their own stages.
 *
 * Admin only. Every function takes the viewer and throws a 403 for staff, so
 * no caller can leak an opportunity by forgetting a check.
 *
 * Changing an opportunity's stage records an 'opportunity_updated' history
 * entry (admin-only) and NEVER changes the person's relationship status.
 */
import { z } from "zod";
import { translate, type Locale } from "~/i18n";
import {
  KINDS_BY_TRACK,
  OPEN_STAGES,
  OPPORTUNITY_TRACKS,
  STAGES_BY_TRACK,
  type OpportunityKind,
  type OpportunityStage,
  type OpportunityTrack,
} from "./constants";
import { isIsoDate, toIsoDate } from "./dates";
import { newId, query, transaction, type Queryable } from "./db.server";
import { recordHistory } from "./history.server";
import { isAdmin, type Viewer } from "./permissions.server";

/** The signed-in admin. `locale` (from the session) picks the language of history notes. */
export type CrmActor = Viewer & { locale?: Locale };

/** Throws the same friendly 403 as requireAdmin when the viewer is not an admin. */
export function assertAdmin(viewer: Viewer | null | undefined): void {
  if (!viewer || !isAdmin(viewer)) throw new Response("Admins only", { status: 403, statusText: "Forbidden" });
}

export function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

export function stagesFor(track: OpportunityTrack): readonly OpportunityStage[] {
  return STAGES_BY_TRACK[track];
}

export function isStageOf(track: OpportunityTrack, stage: string): stage is OpportunityStage {
  return (STAGES_BY_TRACK[track] as readonly string[]).includes(stage);
}

export function isKindOf(track: OpportunityTrack, kind: string): kind is OpportunityKind {
  return (KINDS_BY_TRACK[track] as readonly string[]).includes(kind);
}

export type OpportunityView = {
  id: string;
  person_id: string | null;
  person_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  track: OpportunityTrack;
  kind: OpportunityKind;
  title: string;
  stage: OpportunityStage;
  /** True while the stage is one of OPEN_STAGES. */
  open: boolean;
  amount: string | null;
  /** YYYY-MM-DD */
  target_date: string | null;
  cap_id: string | null;
  cap_title: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  notes: string | null;
  /** Open follow-ups on this opportunity. */
  open_follow_ups: number;
  /** The earliest open follow-up's due date (YYYY-MM-DD), if any. */
  next_follow_up_on: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type OpportunityFilter = {
  track?: OpportunityTrack;
  stage?: OpportunityStage;
  /** "open" (default), "closed" or "all". */
  state?: "open" | "closed" | "all";
  personId?: string;
  ownerUserId?: string;
  /** Words in the title, person or organization. */
  q?: string;
  limit?: number;
};

const ts = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const tsOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : ts(v));

type OpportunityRow = Omit<OpportunityView, "open" | "target_date" | "next_follow_up_on" | "created_at" | "updated_at" | "closed_at"> & {
  target_date: unknown;
  next_follow_up_on: unknown;
  created_at: unknown;
  updated_at: unknown;
  closed_at: unknown;
};

const SELECT_OPPORTUNITY = `
  SELECT o.id, o.person_id, p.full_name AS person_name,
         COALESCE(o.organization_id, p.organization_id) AS organization_id, org.name AS organization_name,
         o.track, o.kind, o.title, o.stage, o.amount, o.target_date, o.cap_id, c.title AS cap_title,
         o.owner_user_id, u.name AS owner_name, o.notes,
         (SELECT count(*)::int FROM follow_ups f WHERE f.opportunity_id = o.id AND f.status = 'open') AS open_follow_ups,
         (SELECT min(f.due_on) FROM follow_ups f WHERE f.opportunity_id = o.id AND f.status = 'open') AS next_follow_up_on,
         o.created_at, o.updated_at, o.closed_at
    FROM opportunities o
    LEFT JOIN people p ON p.id = o.person_id
    LEFT JOIN organizations org ON org.id = COALESCE(o.organization_id, p.organization_id)
    LEFT JOIN caps c ON c.id = o.cap_id
    LEFT JOIN users u ON u.id = o.owner_user_id`;

function toView(row: OpportunityRow): OpportunityView {
  return {
    ...row,
    open: isOpenStage(row.stage),
    target_date: toIsoDate(row.target_date),
    next_follow_up_on: toIsoDate(row.next_follow_up_on),
    created_at: ts(row.created_at),
    updated_at: ts(row.updated_at),
    closed_at: tsOrNull(row.closed_at),
  };
}

/** Opportunities matching the filter: open ones by default, soonest target date first. */
export async function listOpportunities(viewer: Viewer, filter: OpportunityFilter = {}): Promise<OpportunityView[]> {
  assertAdmin(viewer);
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (filter.track) add("o.track = ?", filter.track);
  if (filter.stage) add("o.stage = ?", filter.stage);
  const state = filter.state ?? "open";
  if (state !== "all") add(`${state === "open" ? "" : "NOT "}(o.stage = ANY(?::text[]))`, [...OPEN_STAGES]);
  if (filter.personId) add("o.person_id = ?", filter.personId);
  if (filter.ownerUserId) add("o.owner_user_id = ?", filter.ownerUserId);
  for (const word of (filter.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    add("lower(concat_ws(' ', o.title, p.full_name, org.name, o.notes)) LIKE ?", `%${word.replace(/[%_\\]/g, "\\$&")}%`);
  }
  const limit = Math.min(Math.max(filter.limit ?? 300, 1), 1000);
  const rows = await query<OpportunityRow>(
    `${SELECT_OPPORTUNITY}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY (o.stage = ANY($${params.length + 1}::text[])) DESC, o.target_date ASC NULLS LAST, o.updated_at DESC
     LIMIT ${limit}`,
    [...params, [...OPEN_STAGES]],
  );
  return rows.map(toView);
}

/** Counts of opportunities per stage, for the list's stage chips. */
export async function countOpportunitiesByStage(
  viewer: Viewer,
  filter: Pick<OpportunityFilter, "track" | "ownerUserId"> = {},
): Promise<Partial<Record<OpportunityStage, number>>> {
  assertAdmin(viewer);
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.track) {
    params.push(filter.track);
    where.push(`track = $${params.length}`);
  }
  if (filter.ownerUserId) {
    params.push(filter.ownerUserId);
    where.push(`owner_user_id = $${params.length}`);
  }
  const rows = await query<{ stage: OpportunityStage; n: number }>(
    `SELECT stage, count(*)::int AS n FROM opportunities ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY stage`,
    params,
  );
  return Object.fromEntries(rows.map((r) => [r.stage, r.n]));
}

/** How many opportunities are open (for dashboards). */
export async function countOpenOpportunities(viewer: Viewer, track?: OpportunityTrack): Promise<number> {
  assertAdmin(viewer);
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM opportunities WHERE stage = ANY($1::text[]) ${track ? "AND track = $2" : ""}`,
    track ? [[...OPEN_STAGES], track] : [[...OPEN_STAGES]],
  );
  return rows[0]?.n ?? 0;
}

export async function getOpportunity(viewer: Viewer, id: string, db: Queryable = { query }): Promise<OpportunityView | null> {
  assertAdmin(viewer);
  if (!id || id.length > 100) return null;
  const rows = await db.query<OpportunityRow>(`${SELECT_OPPORTUNITY} WHERE o.id = $1`, [id]);
  return rows[0] ? toView(rows[0]) : null;
}

export type OpportunityHistoryItem = {
  id: string;
  kind: string;
  happened_on: string;
  notes: string | null;
  user_name: string | null;
  meta: { from?: string | null; to?: string; created?: boolean };
  created_at: string;
};

/** History entries linked to an opportunity (stage changes and follow-ups), newest first. */
export async function getOpportunityHistory(viewer: Viewer, id: string): Promise<OpportunityHistoryItem[]> {
  assertAdmin(viewer);
  const rows = await query<Omit<OpportunityHistoryItem, "happened_on" | "created_at"> & { happened_on: unknown; created_at: unknown }>(
    `SELECT e.id, e.kind, e.happened_on, e.notes, u.name AS user_name, e.meta, e.created_at
       FROM engagements e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN follow_ups f ON f.id = e.follow_up_id
      WHERE e.opportunity_id = $1 OR f.opportunity_id = $1
      ORDER BY e.happened_on DESC, e.created_at DESC
      LIMIT 100`,
    [id],
  );
  return rows.map((r) => ({ ...r, meta: r.meta ?? {}, happened_on: toIsoDate(r.happened_on) ?? "", created_at: ts(r.created_at) }));
}

// ---------- writes ----------

export type OpportunityInput = {
  personId: string;
  track: OpportunityTrack;
  kind: OpportunityKind;
  title: string;
  stage: OpportunityStage;
  amount?: string | null;
  targetDate?: string | null;
  capId?: string | null;
  ownerUserId?: string | null;
  notes?: string | null;
};

export class OpportunityInputError extends Error {}

function stageNote(actor: CrmActor, title: string, stage: OpportunityStage, note?: string | null): string {
  const label = translate(actor.locale ?? "en", `common.stage.${stage}`);
  const extra = note?.trim();
  return extra ? `${title}: ${label}. ${extra}` : `${title}: ${label}`;
}

async function checkRefs(db: Queryable, input: Pick<OpportunityInput, "personId" | "capId" | "ownerUserId">): Promise<string | null> {
  const person = await db.query<{ organization_id: string | null }>("SELECT organization_id FROM people WHERE id = $1", [input.personId]);
  if (!person[0]) throw new OpportunityInputError("person");
  if (input.capId && !(await db.query("SELECT 1 FROM caps WHERE id = $1", [input.capId])).length) {
    throw new OpportunityInputError("cap");
  }
  if (input.ownerUserId && !(await db.query("SELECT 1 FROM users WHERE id = $1", [input.ownerUserId])).length) {
    throw new OpportunityInputError("owner");
  }
  return person[0].organization_id;
}

function validate(input: Pick<OpportunityInput, "track" | "kind" | "stage" | "targetDate">) {
  if (!OPPORTUNITY_TRACKS.includes(input.track)) throw new OpportunityInputError("track");
  if (!isStageOf(input.track, input.stage)) throw new OpportunityInputError("stage");
  if (!isKindOf(input.track, input.kind)) throw new OpportunityInputError("kind");
  if (input.targetDate && !isIsoDate(input.targetDate)) throw new OpportunityInputError("targetDate");
}

/** Adds an opportunity and a history entry for it. Returns the new id. */
export async function createOpportunity(actor: CrmActor, input: OpportunityInput): Promise<string> {
  assertAdmin(actor);
  validate(input);
  return transaction(async (tx) => {
    const orgId = await checkRefs(tx, input);
    const id = newId();
    await tx.query(
      `INSERT INTO opportunities (id, person_id, organization_id, track, kind, title, stage, amount, target_date, cap_id,
                                  owner_user_id, notes, created_by, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$13, CASE WHEN $14::boolean THEN NULL ELSE now() END)`,
      [
        id, input.personId, orgId, input.track, input.kind, input.title.trim(), input.stage, input.amount?.trim() || null,
        input.targetDate || null, input.capId || null, input.ownerUserId ?? actor.id, input.notes?.trim() || null, actor.id,
        isOpenStage(input.stage),
      ],
    );
    await recordHistory(
      {
        personId: input.personId, kind: "opportunity_updated", origin: "manual", visibility: "admin", userId: actor.id,
        opportunityId: id, notes: stageNote(actor, input.title.trim(), input.stage),
        meta: { created: true, from: null, to: input.stage, track: input.track },
      },
      tx,
    );
    return id;
  });
}

/**
 * Moves an opportunity to another stage of its own track. Records the change
 * in the person's history; the person's status is left alone. Returns false
 * when the stage was already that (nothing recorded).
 */
export async function changeOpportunityStage(
  actor: CrmActor,
  id: string,
  stage: string,
  note?: string | null,
): Promise<{ changed: boolean }> {
  assertAdmin(actor);
  return transaction(async (tx) => {
    const current = (await tx.query<{ person_id: string | null; track: OpportunityTrack; stage: OpportunityStage; title: string }>(
      "SELECT person_id, track, stage, title FROM opportunities WHERE id = $1 FOR UPDATE",
      [id],
    ))[0];
    if (!current) throw new Response("Not found", { status: 404 });
    if (!isStageOf(current.track, stage)) throw new OpportunityInputError("stage");
    if (current.stage === stage) return { changed: false };
    await tx.query(
      `UPDATE opportunities
          SET stage = $2, updated_at = now(),
              closed_at = CASE WHEN $3::boolean THEN NULL ELSE COALESCE(closed_at, now()) END
        WHERE id = $1`,
      [id, stage, isOpenStage(stage)],
    );
    if (current.person_id) {
      await recordHistory(
        {
          personId: current.person_id, kind: "opportunity_updated", origin: "manual", visibility: "admin", userId: actor.id,
          opportunityId: id, notes: stageNote(actor, current.title, stage, note),
          meta: { from: current.stage, to: stage, track: current.track },
        },
        tx,
      );
    }
    return { changed: true };
  });
}

/**
 * Saves the edit form. The track can change only together with a stage of the
 * new track. A stage change is recorded like changeOpportunityStage.
 */
export async function updateOpportunity(actor: CrmActor, id: string, input: OpportunityInput): Promise<void> {
  assertAdmin(actor);
  validate(input);
  await transaction(async (tx) => {
    const current = (await tx.query<{ person_id: string | null; stage: OpportunityStage; track: OpportunityTrack }>(
      "SELECT person_id, stage, track FROM opportunities WHERE id = $1 FOR UPDATE",
      [id],
    ))[0];
    if (!current) throw new Response("Not found", { status: 404 });
    const orgId = await checkRefs(tx, input);
    await tx.query(
      `UPDATE opportunities
          SET person_id = $2, organization_id = $3, track = $4, kind = $5, title = $6, stage = $7, amount = $8,
              target_date = $9::date, cap_id = $10, owner_user_id = $11, notes = $12, updated_at = now(),
              closed_at = CASE WHEN $13::boolean THEN NULL ELSE COALESCE(closed_at, now()) END
        WHERE id = $1`,
      [
        id, input.personId, orgId, input.track, input.kind, input.title.trim(), input.stage, input.amount?.trim() || null,
        input.targetDate || null, input.capId || null, input.ownerUserId || null, input.notes?.trim() || null,
        isOpenStage(input.stage),
      ],
    );
    if (current.stage !== input.stage) {
      await recordHistory(
        {
          personId: input.personId, kind: "opportunity_updated", origin: "manual", visibility: "admin", userId: actor.id,
          opportunityId: id, notes: stageNote(actor, input.title.trim(), input.stage),
          meta: { from: current.stage, to: input.stage, track: input.track },
        },
        tx,
      );
    }
  });
}

/** Deletes an opportunity. Its follow-ups stay (unlinked); history entries keep their text. */
export async function deleteOpportunity(actor: CrmActor, id: string): Promise<void> {
  assertAdmin(actor);
  await query("DELETE FROM opportunities WHERE id = $1", [id]);
}

// ---------- form options and parsing ----------

export type PersonOption = { id: string; full_name: string; organization_name: string | null };
export type NamedOption = { id: string; name: string };

/** Everything the opportunity and follow-up forms pick from: people, CAPs and admins (owners). */
export async function getCrmFormOptions(viewer: Viewer): Promise<{ people: PersonOption[]; caps: NamedOption[]; owners: NamedOption[] }> {
  assertAdmin(viewer);
  const [people, caps, owners] = await Promise.all([
    query<PersonOption>(
      `SELECT p.id, p.full_name, o.name AS organization_name
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        ORDER BY lower(p.full_name) LIMIT 2000`,
    ),
    query<NamedOption>("SELECT id, title AS name FROM caps WHERE status <> 'complete' ORDER BY lower(title)"),
    listCrmOwners(viewer),
  ]);
  return { people, caps, owners };
}

/** Who can own opportunities and follow-ups: the admins. */
export async function listCrmOwners(viewer: Viewer): Promise<NamedOption[]> {
  assertAdmin(viewer);
  return query<NamedOption>("SELECT id, name FROM users WHERE role = 'admin' ORDER BY lower(name)");
}

export type OpportunityFormField = "personId" | "title" | "kind" | "stage" | "targetDate" | "amount" | "notes";
export type OpportunityFormErrors = Partial<
  Record<OpportunityFormField, "crm.error.personRequired" | "crm.error.titleRequired" | "crm.error.tooLong" | "crm.error.badDate" | "crm.error.badChoice">
>;

const optional = (max: number) =>
  z.string().trim().max(max, "crm.error.tooLong").transform((v) => v || null);

const opportunitySchema = z.object({
  personId: z.string().trim().min(1, "crm.error.personRequired").max(100, "crm.error.personRequired"),
  track: z.enum(OPPORTUNITY_TRACKS).catch("engagement"),
  kind: z.string(),
  stage: z.string(),
  title: z.string().trim().min(1, "crm.error.titleRequired").max(200, "crm.error.tooLong"),
  amount: optional(60),
  targetDate: z
    .string()
    .trim()
    .refine((v) => !v || isIsoDate(v), "crm.error.badDate")
    .transform((v) => v || null),
  capId: z.string().trim().transform((v) => (v && v !== "none" ? v : null)),
  ownerUserId: z.string().trim().transform((v) => (v && v !== "none" ? v : null)),
  notes: optional(4000),
});

/** Reads the opportunity form. Kind and stage must belong to the chosen track. Errors are i18n keys. */
export function parseOpportunityForm(
  form: FormData,
): { ok: true; value: OpportunityInput } | { ok: false; errors: OpportunityFormErrors } {
  const str = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const parsed = opportunitySchema.safeParse({
    personId: str("personId"),
    track: str("track"),
    kind: str("kind"),
    stage: str("stage"),
    title: str("title"),
    amount: str("amount"),
    targetDate: str("targetDate"),
    capId: str("capId"),
    ownerUserId: str("ownerUserId"),
    notes: str("notes"),
  });
  const errors: OpportunityFormErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as OpportunityFormField;
      errors[field] ??= issue.message as OpportunityFormErrors[OpportunityFormField];
    }
    return { ok: false, errors };
  }
  const v = parsed.data;
  if (!isKindOf(v.track, v.kind)) errors.kind = "crm.error.badChoice";
  if (!isStageOf(v.track, v.stage)) errors.stage = "crm.error.badChoice";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...v, kind: v.kind as OpportunityKind, stage: v.stage as OpportunityStage } };
}

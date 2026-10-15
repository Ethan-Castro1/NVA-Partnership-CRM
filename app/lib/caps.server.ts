/** Community Action Projects and the partners attached to them. */
import { z } from "zod";
import { CAP_PARTNER_STATUSES, CAP_STATUSES, normalizeTags, type CapPartnerStatus, type CapStatus } from "./constants";
import { newId, query, queryOne } from "./db.server";
import { findConnectorsForNeed, type IntroPath, type MiniPerson, type SearchHit } from "./people.server";

export type CapSummary = {
  id: string;
  title: string;
  driving_question: string | null;
  description: string | null;
  topics: string[];
  needs: string | null;
  term: string | null;
  status: CapStatus;
  owner_id: string | null;
  owner_name: string | null;
  partner_count: number;
  confirmed_count: number;
  updated_at: string;
};

export type CapPartnerView = {
  person: MiniPerson & { email: string | null; skills: string[] };
  role: string | null;
  status: CapPartnerStatus;
  note: string | null;
  created_at: string;
};

const CAP_COLUMNS = `
  c.id, c.title, c.driving_question, c.description, c.topics, c.needs, c.term, c.status, c.owner_id,
  u.name AS owner_name, c.updated_at,
  (SELECT count(*)::int FROM cap_partners cp WHERE cp.cap_id = c.id AND cp.status <> 'declined') AS partner_count,
  (SELECT count(*)::int FROM cap_partners cp WHERE cp.cap_id = c.id AND cp.status = 'confirmed') AS confirmed_count`;

export async function listCaps(filter: { ownerId?: string; status?: CapStatus } = {}): Promise<CapSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.ownerId) {
    params.push(filter.ownerId);
    where.push(`c.owner_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`c.status = $${params.length}`);
  }
  return query<CapSummary>(
    `SELECT ${CAP_COLUMNS} FROM caps c LEFT JOIN users u ON u.id = c.owner_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 ELSE 2 END, c.updated_at DESC`,
    params,
  );
}

export async function getCap(id: string): Promise<CapSummary | null> {
  return queryOne<CapSummary>(`SELECT ${CAP_COLUMNS} FROM caps c LEFT JOIN users u ON u.id = c.owner_id WHERE c.id = $1`, [id]);
}

export type CapInput = {
  title: string;
  driving_question?: string | null;
  description?: string | null;
  topics?: string[] | string;
  needs?: string | null;
  term?: string | null;
  status?: CapStatus;
};

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function createCap(input: CapInput, ownerId: string): Promise<string> {
  const id = newId();
  await query(
    `INSERT INTO caps (id, title, driving_question, description, topics, needs, term, status, owner_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      input.title.trim(),
      blank(input.driving_question),
      blank(input.description),
      normalizeTags(input.topics),
      blank(input.needs),
      blank(input.term),
      input.status ?? "planning",
      ownerId,
    ],
  );
  return id;
}

export async function updateCap(id: string, input: CapInput): Promise<void> {
  await query(
    `UPDATE caps SET title = $2, driving_question = $3, description = $4, topics = $5, needs = $6, term = $7,
                     status = $8, updated_at = now()
      WHERE id = $1`,
    [
      id,
      input.title.trim(),
      blank(input.driving_question),
      blank(input.description),
      normalizeTags(input.topics),
      blank(input.needs),
      blank(input.term),
      input.status ?? "planning",
    ],
  );
}

export async function deleteCap(id: string): Promise<void> {
  await query("DELETE FROM caps WHERE id = $1", [id]);
}

export async function getCapPartners(capId: string): Promise<CapPartnerView[]> {
  const rows = await query<{
    id: string; full_name: string; title: string | null; organization_name: string | null; affiliations: MiniPerson["affiliations"];
    person_status: MiniPerson["status"]; email: string | null; skills: string[];
    role: string | null; status: CapPartnerStatus; note: string | null; created_at: string;
  }>(
    `SELECT p.id, p.full_name, p.title, o.name AS organization_name, p.affiliations, p.status AS person_status, p.email, p.skills,
            cp.role, cp.status, cp.note, cp.created_at
       FROM cap_partners cp
       JOIN people p ON p.id = cp.person_id
       LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE cp.cap_id = $1
      ORDER BY CASE cp.status WHEN 'confirmed' THEN 0 WHEN 'contacted' THEN 1 WHEN 'suggested' THEN 2 ELSE 3 END, p.full_name`,
    [capId],
  );
  return rows.map((r) => ({
    person: {
      id: r.id, full_name: r.full_name, title: r.title, organization_name: r.organization_name,
      affiliations: r.affiliations, status: r.person_status, email: r.email, skills: r.skills,
    },
    role: r.role,
    status: r.status,
    note: r.note,
    created_at: r.created_at,
  }));
}

/** The CAPs one person is attached to (for their profile). */
export async function getCapsForPerson(personId: string): Promise<(Pick<CapSummary, "id" | "title" | "status"> & { partner_status: CapPartnerStatus })[]> {
  return query(
    `SELECT c.id, c.title, c.status, cp.status AS partner_status
       FROM cap_partners cp JOIN caps c ON c.id = cp.cap_id
      WHERE cp.person_id = $1 ORDER BY c.updated_at DESC`,
    [personId],
  );
}

/** Adds a partner (or leaves an existing link as is). */
export async function addCapPartner(
  input: { capId: string; personId: string; status?: CapPartnerStatus; role?: string | null; note?: string | null },
  userId: string | null,
): Promise<void> {
  await query(
    `INSERT INTO cap_partners (cap_id, person_id, role, status, note, added_by) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (cap_id, person_id) DO NOTHING`,
    [input.capId, input.personId, blank(input.role), input.status ?? "suggested", blank(input.note), userId],
  );
  await query("UPDATE caps SET updated_at = now() WHERE id = $1", [input.capId]);
}

export async function updateCapPartner(
  capId: string,
  personId: string,
  input: { status: CapPartnerStatus; role?: string | null; note?: string | null },
): Promise<void> {
  await query("UPDATE cap_partners SET status = $3, role = $4, note = $5 WHERE cap_id = $1 AND person_id = $2", [
    capId, personId, input.status, blank(input.role), blank(input.note),
  ]);
}

export async function removeCapPartner(capId: string, personId: string): Promise<void> {
  await query("DELETE FROM cap_partners WHERE cap_id = $1 AND person_id = $2", [capId, personId]);
}

// ---------- permissions and suggestions ----------

/** Only a CAP's owner or an admin may edit or delete it. Check on the server, not just in the UI. */
export function canEditCap(cap: Pick<CapSummary, "owner_id">, user: { id: string; role: string }): boolean {
  return user.role === "admin" || (!!cap.owner_id && cap.owner_id === user.id);
}

/** The words that describe what a CAP needs: its needs text plus its topics. */
export function capSearchText(cap: Pick<CapSummary, "needs" | "topics">): string {
  return [cap.needs ?? "", ...cap.topics].map((part) => part.trim()).filter(Boolean).join(", ");
}

export type CapSuggestion = { person: SearchHit; direct: boolean; paths: IntroPath[]; matched: string[] };

/**
 * People who could partner on a CAP: first those whose CAP topics overlap and
 * who match its needs or topics, then (to fill up) anyone matching the words
 * alone. People already on the CAP are left out.
 */
export async function getCapSuggestions(
  cap: Pick<CapSummary, "id" | "needs" | "topics">,
  limit = 8,
): Promise<CapSuggestion[]> {
  const q = capSearchText(cap);
  if (!q) return [];
  const taken = new Set(
    (await query<{ person_id: string }>("SELECT person_id FROM cap_partners WHERE cap_id = $1", [cap.id])).map((r) => r.person_id),
  );
  const want = limit + taken.size;
  const byTopic = cap.topics.length ? await findConnectorsForNeed({ q, capTopics: cap.topics, limit: want }) : [];
  const byWords = byTopic.length - byTopic.filter((r) => taken.has(r.person.id)).length >= limit
    ? []
    : await findConnectorsForNeed({ q, limit: want });

  const topics = new Set(normalizeTags(cap.topics));
  const out: CapSuggestion[] = [];
  for (const result of [...byTopic, ...byWords]) {
    if (taken.has(result.person.id)) continue;
    taken.add(result.person.id);
    const matched = [...new Set([...result.person.matched, ...result.person.cap_topics.filter((t) => topics.has(t))])];
    out.push({ ...result, matched });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- form parsing ----------

export const MAX_CAP_TOPICS = 12;

export type CapFormField = "title" | "driving_question" | "description" | "topics" | "needs" | "term";
export type CapFormErrorKey = "caps.form.error.titleRequired" | "caps.form.error.tooLong" | "caps.form.error.tooManyTopics";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "caps.form.error.tooLong")
    .transform((v) => v || null);

const capFormSchema = z.object({
  title: z.string().trim().min(1, "caps.form.error.titleRequired").max(160, "caps.form.error.tooLong"),
  driving_question: optionalText(400),
  description: optionalText(4000),
  needs: optionalText(1000),
  term: optionalText(60),
  topics: z.array(z.string()).max(MAX_CAP_TOPICS, "caps.form.error.tooManyTopics"),
  // Unknown values fall back to 'planning' rather than failing the whole form.
  status: z.enum(CAP_STATUSES).catch("planning"),
});

/**
 * Reads the CAP form: chosen topic pills (`topics`) plus typed ones
 * (`topics_other`, comma-separated), lengths capped. Errors are i18n keys.
 */
export function parseCapForm(
  form: FormData,
): { ok: true; value: CapInput & { status: CapStatus } } | { ok: false; errors: Partial<Record<CapFormField, CapFormErrorKey>> } {
  const str = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const topics = normalizeTags([
    ...form.getAll("topics").filter((v): v is string => typeof v === "string"),
    ...str("topics_other").split(/[,;\n]/),
  ]);
  const parsed = capFormSchema.safeParse({
    title: str("title"),
    driving_question: str("driving_question"),
    description: str("description"),
    needs: str("needs"),
    term: str("term"),
    topics,
    status: str("status"),
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: Partial<Record<CapFormField, CapFormErrorKey>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as CapFormField;
    errors[field] ??= issue.message as CapFormErrorKey;
  }
  return { ok: false, errors };
}

const partnerUpdateSchema = z.object({
  personId: z.string().min(1).max(100),
  status: z.enum(CAP_PARTNER_STATUSES),
  role: z.string().trim().transform((v) => v.slice(0, 120)).catch(""),
  note: z.string().trim().transform((v) => v.slice(0, 500)).catch(""),
});

/** Reads an inline partner update; null when the input is unusable. */
export function parsePartnerUpdate(form: FormData): z.infer<typeof partnerUpdateSchema> | null {
  const parsed = partnerUpdateSchema.safeParse({
    personId: form.get("personId"),
    status: form.get("status"),
    role: form.get("role") ?? "",
    note: form.get("note") ?? "",
  });
  return parsed.success ? parsed.data : null;
}

/** Community Action Projects and the partners attached to them. */
import { normalizeTags, type CapPartnerStatus, type CapStatus } from "./constants";
import { newId, query, queryOne } from "./db.server";
import type { MiniPerson } from "./people.server";

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

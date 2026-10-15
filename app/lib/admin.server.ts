/**
 * Admin-only data: the overview dashboard, reviewing sign-ups, staff
 * accounts and the CSV export. Routes call requireAdmin before any of this;
 * these functions trust that check and only enforce data rules (like
 * "there is always one active admin").
 */
import type { MessageKey } from "~/i18n";
import {
  AFFILIATIONS,
  CONTRIBUTION_TYPES,
  LANGUAGES,
  RELATIONSHIP_KINDS,
  type Affiliation,
  type CapStatus,
  type ContributionType,
  type PersonSource,
  type PersonStatus,
  type PreferredLanguage,
  type Role,
} from "./constants";
import { query, queryOne, transaction } from "./db.server";
import type { IntakePayload, IntakeReferral } from "./intake-types";
import { getCounts, updatePerson } from "./people.server";

/** Timestamps leave the server as ISO strings (pg and PGlite both hand back Dates). */
function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value ? new Date(String(value)).toISOString() : "";
}
function isoOrNull(value: unknown): string | null {
  return value ? iso(value) : null;
}

// ---------- overview ----------

import { INTAKE_STATUSES, type IntakeStatus } from "./constants";
export { INTAKE_STATUSES, type IntakeStatus };

export type SignupRow = {
  id: string;
  full_name: string;
  email: string | null;
  contribution_types: ContributionType[];
  preferred_language: PreferredLanguage;
  locale: string;
  referral_count: number;
  submitted_at: string;
  status: IntakeStatus;
  person_id: string | null;
  person_status: PersonStatus | null;
};

export type LeadRow = {
  id: string;
  full_name: string;
  title: string | null;
  organization_name: string | null;
  created_at: string;
  last_contact: string | null;
};

export type CapNeedingPartnerRow = {
  id: string;
  title: string;
  status: CapStatus;
  term: string | null;
  owner_name: string | null;
};

export type RecentPersonRow = {
  id: string;
  full_name: string;
  title: string | null;
  organization_name: string | null;
  contribution_types: ContributionType[];
  source: PersonSource;
  status: PersonStatus;
  created_at: string;
};

const SIGNUP_COLUMNS = `
  s.id, s.status, s.locale, s.submitted_at, s.person_id, p.status AS person_status,
  coalesce(p.full_name, s.payload->>'full_name', '') AS full_name,
  coalesce(p.email, s.payload->>'email') AS email,
  coalesce(s.payload->>'preferred_language', 'en') AS preferred_language,
  CASE WHEN jsonb_typeof(s.payload->'contribution_types') = 'array'
       THEN ARRAY(SELECT jsonb_array_elements_text(s.payload->'contribution_types')) ELSE '{}'::text[] END AS contribution_types,
  CASE WHEN jsonb_typeof(s.payload->'referrals') = 'array'
       THEN jsonb_array_length(s.payload->'referrals') ELSE 0 END AS referral_count`;

function toSignupRow(row: SignupRow): SignupRow {
  return {
    ...row,
    referral_count: Number(row.referral_count),
    submitted_at: iso(row.submitted_at),
    contribution_types: CONTRIBUTION_TYPES.filter((type) => row.contribution_types.includes(type)),
    preferred_language: LANGUAGES.includes(row.preferred_language) ? row.preferred_language : "en",
  };
}

export async function getAdminOverview() {
  const [counts, caps, signups, leads, capsWithoutPartner, recent] = await Promise.all([
    getCounts(),
    queryOne<{ n: number }>("SELECT count(*)::int AS n FROM caps WHERE status = 'active'"),
    query<SignupRow>(
      `SELECT ${SIGNUP_COLUMNS} FROM intake_submissions s LEFT JOIN people p ON p.id = s.person_id
        WHERE s.status = 'new' ORDER BY s.submitted_at DESC LIMIT 5`,
    ),
    // Leads waiting longest come first.
    query<LeadRow>(
      `SELECT p.id, p.full_name, p.title, o.name AS organization_name, p.created_at,
              (SELECT max(e.happened_on)::text FROM engagements e WHERE e.person_id = p.id) AS last_contact
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE p.status = 'lead'
        ORDER BY p.created_at ASC, p.full_name LIMIT 10`,
    ),
    query<CapNeedingPartnerRow>(
      `SELECT c.id, c.title, c.status, c.term, u.name AS owner_name
         FROM caps c LEFT JOIN users u ON u.id = c.owner_id
        WHERE c.status IN ('planning', 'active')
          AND NOT EXISTS (SELECT 1 FROM cap_partners cp WHERE cp.cap_id = c.id AND cp.status = 'confirmed')
        ORDER BY c.status = 'active' DESC, c.created_at ASC LIMIT 10`,
    ),
    query<RecentPersonRow>(
      `SELECT p.id, p.full_name, p.title, o.name AS organization_name, p.contribution_types, p.source, p.status, p.created_at
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        ORDER BY p.created_at DESC, p.full_name LIMIT 6`,
    ),
  ]);
  return {
    counts: { ...counts, activeCaps: caps?.n ?? 0 },
    signups: signups.map(toSignupRow),
    leads: leads.map((row) => ({ ...row, created_at: iso(row.created_at) })),
    capsWithoutPartner,
    recent: recent.map((row) => ({ ...row, created_at: iso(row.created_at) })),
  };
}

// ---------- sign-ups ----------

export async function listIntake(status: IntakeStatus): Promise<{ rows: SignupRow[]; counts: Record<IntakeStatus, number> }> {
  const [rows, counts] = await Promise.all([
    query<SignupRow>(
      `SELECT ${SIGNUP_COLUMNS} FROM intake_submissions s LEFT JOIN people p ON p.id = s.person_id
        WHERE s.status = $1 ORDER BY s.submitted_at DESC LIMIT 500`,
      [status],
    ),
    query<{ status: IntakeStatus; n: number }>("SELECT status, count(*)::int AS n FROM intake_submissions GROUP BY status"),
  ]);
  const byStatus = { new: 0, reviewed: 0, archived: 0 } as Record<IntakeStatus, number>;
  for (const c of counts) byStatus[c.status] = c.n;
  return { rows: rows.map(toSignupRow), counts: byStatus };
}

const str = (value: unknown, max = 2000): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => str(v, 120)).filter((v): v is string => !!v) : [];

/**
 * Reads a stored payload defensively: old or hand-edited rows still render,
 * unknown enum values are dropped, and free text stays as the person typed it.
 */
export function readPayload(raw: unknown): IntakePayload {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const referredBy = p.referred_by && typeof p.referred_by === "object" ? (p.referred_by as Record<string, unknown>) : null;
  const lang = p.preferred_language as PreferredLanguage;
  return {
    full_name: str(p.full_name, 200) ?? "",
    email: str(p.email, 320) ?? "",
    phone: str(p.phone, 60),
    preferred_language: LANGUAGES.includes(lang) ? lang : "en",
    organization: str(p.organization, 200),
    title: str(p.title, 200),
    contribution_types: CONTRIBUTION_TYPES.filter((t) => strList(p.contribution_types).includes(t)),
    skills: strList(p.skills),
    cap_topics: strList(p.cap_topics),
    availability: str(p.availability),
    bio: str(p.bio, 5000),
    affiliations: AFFILIATIONS.filter((a) => strList(p.affiliations).includes(a)),
    referred_by: referredBy && str(referredBy.name, 200)
      ? { name: str(referredBy.name, 200)!, email: str(referredBy.email, 320) }
      : null,
    referrals: (Array.isArray(p.referrals) ? p.referrals : [])
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !!str((r as Record<string, unknown>).name))
      .slice(0, 50)
      .map(
        (r): IntakeReferral => ({
          name: str(r.name, 200)!,
          email: str(r.email, 320),
          phone: str(r.phone, 60),
          how_known: str(r.how_known),
          can_help_with: str(r.can_help_with),
          kind: RELATIONSHIP_KINDS.find((k) => k === r.kind),
        }),
      ),
    consent: p.consent === true,
  };
}

export type LinkedPerson = {
  id: string;
  full_name: string;
  email: string | null;
  title: string | null;
  organization_name: string | null;
  status: PersonStatus;
  contribution_types: ContributionType[];
  affiliations: Affiliation[];
};

type MatchCandidate = { id: string; full_name: string; email: string | null; source: PersonSource; status: PersonStatus };
export type MatchedPerson = { id: string; full_name: string; status: PersonStatus } | null;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Finds the profile a name/email in a sign-up refers to: same email wins,
 * then the same name among `preferred` (people tied to this sign-up), then
 * the same name among `fallback`.
 */
export function matchPerson(
  target: { name: string; email?: string | null },
  preferred: MatchCandidate[],
  fallback: MatchCandidate[],
): MatchedPerson {
  const email = norm(target.email);
  const name = norm(target.name);
  const all = [...preferred, ...fallback];
  const hit =
    (email && all.find((c) => norm(c.email) === email)) ||
    (name && preferred.find((c) => norm(c.full_name) === name)) ||
    (name && fallback.find((c) => norm(c.full_name) === name)) ||
    null;
  return hit ? { id: hit.id, full_name: hit.full_name, status: hit.status } : null;
}

export type IntakeDetail = {
  id: string;
  status: IntakeStatus;
  locale: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  payload: IntakePayload;
  person: LinkedPerson | null;
  referredBy: MatchedPerson;
  referrals: { referral: IntakeReferral; match: MatchedPerson }[];
};

export async function getIntakeSubmission(id: string): Promise<IntakeDetail | null> {
  const row = await queryOne<{
    id: string; status: IntakeStatus; locale: string; submitted_at: Date | string; reviewed_at: Date | string | null;
    reviewed_by_name: string | null; payload: unknown; person_id: string | null;
  }>(
    `SELECT s.id, s.status, s.locale, s.submitted_at, s.reviewed_at, u.name AS reviewed_by_name, s.payload, s.person_id
       FROM intake_submissions s LEFT JOIN users u ON u.id = s.reviewed_by WHERE s.id = $1`,
    [id],
  );
  if (!row) return null;
  const payload = readPayload(typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload);

  const person = row.person_id
    ? await queryOne<LinkedPerson>(
        `SELECT p.id, p.full_name, p.email, p.title, o.name AS organization_name, p.status, p.contribution_types, p.affiliations
           FROM people p LEFT JOIN organizations o ON o.id = p.organization_id WHERE p.id = $1`,
        [row.person_id],
      )
    : null;

  // People already tied to this sign-up through 'referred' links come first.
  const columns = "p.id, p.full_name, p.email, p.source, p.status";
  const [referrers, referred, emailMatches, referralSourced] = await Promise.all([
    person
      ? query<MatchCandidate>(
          `SELECT ${columns} FROM relationships r JOIN people p ON p.id = r.person_id
            WHERE r.related_person_id = $1 AND r.kind = 'referred'`,
          [person.id],
        )
      : Promise.resolve([]),
    person
      ? query<MatchCandidate>(
          `SELECT ${columns} FROM relationships r JOIN people p ON p.id = r.related_person_id
            WHERE r.person_id = $1 AND r.kind = 'referred'`,
          [person.id],
        )
      : Promise.resolve([]),
    query<MatchCandidate>(`SELECT ${columns} FROM people p WHERE lower(p.email) = ANY($1::text[])`, [
      [payload.referred_by?.email, ...payload.referrals.map((r) => r.email)].map(norm).filter(Boolean),
    ]),
    query<MatchCandidate>(`SELECT ${columns} FROM people p WHERE p.source = 'referral' AND lower(p.full_name) = ANY($1::text[])`, [
      payload.referrals.map((r) => norm(r.name)),
    ]),
  ]);

  // A referrer is usually an existing partner, so any exact name match counts there.
  const referrerByName = payload.referred_by
    ? await query<MatchCandidate>(`SELECT ${columns} FROM people p WHERE lower(p.full_name) = $1 LIMIT 5`, [
        norm(payload.referred_by.name),
      ])
    : [];

  return {
    id: row.id,
    status: row.status,
    locale: row.locale,
    submitted_at: iso(row.submitted_at),
    reviewed_at: isoOrNull(row.reviewed_at),
    reviewed_by_name: row.reviewed_by_name,
    payload,
    person: person ? { ...person, contribution_types: CONTRIBUTION_TYPES.filter((t) => person.contribution_types.includes(t)) } : null,
    referredBy: payload.referred_by
      ? matchPerson(payload.referred_by, referrers, [...emailMatches, ...referrerByName])
      : null,
    referrals: payload.referrals.map((referral) => ({
      referral,
      match: matchPerson(referral, referred, [...emailMatches, ...referralSourced]),
    })),
  };
}

/**
 * Moves a sign-up between New, Reviewed and Archived. Reviewing or archiving
 * records who did it and when; moving back to New clears that.
 */
export async function setIntakeStatus(
  id: string,
  status: IntakeStatus,
  reviewerId: string,
  options: { activatePerson?: boolean } = {},
): Promise<boolean> {
  return transaction(async (tx) => {
    const rows = await tx.query<{ person_id: string | null }>(
      status === "new"
        ? "UPDATE intake_submissions SET status = $2, reviewed_by = NULL, reviewed_at = NULL WHERE id = $1 RETURNING person_id"
        : "UPDATE intake_submissions SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1 RETURNING person_id",
      status === "new" ? [id, status] : [id, status, reviewerId],
    );
    if (!rows[0]) return false;
    if (status === "reviewed" && options.activatePerson && rows[0].person_id) {
      await updatePerson(rows[0].person_id, { status: "active" }, tx);
    }
    return true;
  });
}

/** The next sign-up still waiting for review, in the list's order (newest first). */
export async function nextNewIntake(excludeId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    "SELECT id FROM intake_submissions WHERE status = 'new' AND id <> $1 ORDER BY submitted_at DESC LIMIT 1",
    [excludeId],
  );
  return row?.id ?? null;
}

// ---------- staff accounts ----------

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: "en" | "es";
  active: boolean;
  created_at: string;
  last_login_at: string | null;
};

export async function listStaff(): Promise<StaffRow[]> {
  const rows = await query<StaffRow>(
    "SELECT id, name, email, role, locale, active, created_at, last_login_at FROM users ORDER BY active DESC, lower(name)",
  );
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at), last_login_at: isoOrNull(r.last_login_at) }));
}

export type AccountChange = { kind: "role"; role: Role } | { kind: "active"; active: boolean };
export type AccountGuardError = Extract<MessageKey, "admin.error.self" | "admin.error.lastAdmin">;

/**
 * The guard rails for role and active changes, kept pure so they're easy to
 * test: nobody can demote or deactivate themselves, and the last active
 * admin can't be demoted or deactivated (or the school is locked out).
 */
export function accountChangeProblem(
  actorId: string,
  target: { id: string; role: Role; active: boolean },
  change: AccountChange,
  activeAdminCount: number,
): AccountGuardError | null {
  const removesAdmin =
    target.role === "admin" &&
    ((change.kind === "role" && change.role !== "admin") || (change.kind === "active" && !change.active));
  const deactivates = change.kind === "active" && !change.active;
  if (target.id === actorId && (removesAdmin || deactivates)) return "admin.error.self";
  if (removesAdmin && target.active && activeAdminCount <= 1) return "admin.error.lastAdmin";
  return null;
}

export type ChangeResult = { ok: true } | { ok: false; error: AccountGuardError | "admin.error.userNotFound" };

/**
 * Applies a role or active change under the guard. The active admin rows are
 * locked first, so two admins demoting each other at once can't both win.
 */
export async function changeStaffAccount(actorId: string, targetId: string, change: AccountChange): Promise<ChangeResult> {
  return transaction(async (tx) => {
    const admins = await tx.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND active FOR UPDATE");
    const [target] = await tx.query<{ id: string; role: Role; active: boolean }>(
      "SELECT id, role, active FROM users WHERE id = $1 FOR UPDATE",
      [targetId],
    );
    if (!target) return { ok: false, error: "admin.error.userNotFound" } as const;
    const problem = accountChangeProblem(actorId, target, change, admins.length);
    if (problem) return { ok: false, error: problem } as const;
    if (change.kind === "role") await tx.query("UPDATE users SET role = $2 WHERE id = $1", [targetId, change.role]);
    else await tx.query("UPDATE users SET active = $2 WHERE id = $1", [targetId, change.active]);
    return { ok: true } as const;
  });
}

export async function emailTaken(email: string): Promise<boolean> {
  return !!(await queryOne("SELECT 1 FROM users WHERE email = $1", [email.trim().toLowerCase()]));
}

export async function getStaff(id: string): Promise<{ id: string; name: string; active: boolean } | null> {
  return queryOne("SELECT id, name, active FROM users WHERE id = $1", [id]);
}

// ---------- my account ----------

export async function getPasswordHash(userId: string): Promise<string | null> {
  return (await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [userId]))?.password_hash ?? null;
}

export async function updateOwnProfile(userId: string, input: { name: string; locale: "en" | "es" }): Promise<void> {
  await query("UPDATE users SET name = $2, locale = $3 WHERE id = $1", [userId, input.name.trim(), input.locale]);
}

// ---------- CSV export ----------

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV cell: neutralizes spreadsheet formulas (a leading = + - @ tab or CR
 * gets a ' so Excel shows it as text), then quotes when needed.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = Array.isArray(value) ? value.join("; ") : value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Rows to CSV text with CRLF line endings and a UTF-8 BOM so Excel reads accents right. */
export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type ExportPerson = {
  full_name: string;
  email: string | null;
  phone: string | null;
  organization_name: string | null;
  title: string | null;
  contribution_types: string[];
  skills: string[];
  cap_topics: string[];
  affiliations: string[];
  status: PersonStatus;
  source: PersonSource;
  preferred_language: PreferredLanguage;
  availability: string | null;
  created_at: string;
  updated_at: string;
};

export async function listPeopleForExport(): Promise<ExportPerson[]> {
  const rows = await query<ExportPerson>(
    `SELECT p.full_name, p.email, p.phone, o.name AS organization_name, p.title, p.contribution_types, p.skills,
            p.cap_topics, p.affiliations, p.status, p.source, p.preferred_language, p.availability, p.created_at, p.updated_at
       FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
      ORDER BY lower(p.full_name)`,
  );
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at), updated_at: iso(r.updated_at) }));
}

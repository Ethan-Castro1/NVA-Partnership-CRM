/**
 * Duplicate detection: before adding a contact (quick add, the full form, a
 * sign-up being approved), look for records that are probably the same person.
 *
 * Admin-only: it looks at every record, hidden ones included, and returns
 * their contact details. Never call it with input from a staff member or show
 * its results to one.
 */
import { query, type Queryable } from "./db.server";
import type { PersonStatus } from "./constants";

export type DuplicateReason = "email" | "phone" | "name_org" | "name";

export type DuplicateCandidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  organization_name: string | null;
  status: PersonStatus;
  directory_visible: boolean;
  /** Why it looks like the same person, strongest first. */
  reasons: DuplicateReason[];
  /** Higher is more likely the same person (email 100, phone 60, name and organization 40, name 20). */
  score: number;
};

export type DuplicateInput = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization_name?: string | null;
};

// Accented Latin letters and their plain forms, for folding names in SQL like normalizeName does in JS.
const ACCENTED = "áàâäãåāéèêëēíìîïīóòôöõōúùûüūñçýÿ";
const PLAIN = "aaaaaaaeeeeeiiiiioooooouuuuuncyy";

const REASON_SCORE: Record<DuplicateReason, number> = { email: 100, phone: 60, name_org: 40, name: 20 };

/** Lowercase, trimmed, single-spaced, without accents: "  José  Pérez " and "jose perez" match. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** The last 10 digits of a phone number ("(410) 555-0101" and "+1 410 555 0101" match), or "" when too short to compare. */
export function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : "";
}

/** `expr` folded in SQL the way normalizeName folds it (Latin accents). */
const sqlName = (expr: string) =>
  `trim(regexp_replace(translate(lower(coalesce(${expr}, '')), '${ACCENTED}', '${PLAIN}'), '[^a-z0-9]+', ' ', 'g'))`;
const sqlDigits = (expr: string) => `regexp_replace(coalesce(${expr}, ''), '\\D', '', 'g')`;

/**
 * SQL that is true when some person (other than `excludeIdExpr`) matches the
 * JSON sign-up `payloadExpr` by the same rules as findDuplicates: email, the
 * last 10 phone digits, or the folded name. For list views, where calling
 * findDuplicates per row would be too slow. Both arguments are SQL
 * expressions written by us, never user input.
 */
export function possibleDuplicateSql(payloadExpr: string, excludeIdExpr: string): string {
  const email = `lower(trim(coalesce(${payloadExpr}->>'email', '')))`;
  const phone = sqlDigits(`${payloadExpr}->>'phone'`);
  const name = sqlName(`${payloadExpr}->>'full_name'`);
  return `EXISTS (SELECT 1 FROM people m
     WHERE m.id IS DISTINCT FROM ${excludeIdExpr}
       AND ((${email} <> '' AND lower(m.email) = ${email})
         OR (length(${phone}) >= 7 AND right(${sqlDigits("m.phone")}, 10) = right(${phone}, 10))
         OR (${name} <> '' AND ${sqlName("m.full_name")} = ${name})))`;
}

/**
 * Records that may be the same person as `input`, most likely first. A
 * candidate needs at least one of: the same email, the same last-10 phone
 * digits, the same name and organization, or the same name.
 */
export async function findDuplicates(
  input: DuplicateInput,
  options: { excludeId?: string | null; limit?: number; db?: Queryable } = {},
): Promise<DuplicateCandidate[]> {
  const db = options.db ?? { query };
  const email = normalizeEmail(input.email);
  const phone = phoneKey(input.phone);
  const name = normalizeName(input.full_name);
  const org = normalizeName(input.organization_name);
  if (!email && !phone && !name) return [];

  // Match in SQL (names folded the same way normalizeName folds them, for Latin accents),
  // then confirm in JS so every reason is computed one way.
  const rows = await db.query<Omit<DuplicateCandidate, "reasons" | "score">>(
    `SELECT p.id, p.full_name, p.email, p.phone, o.name AS organization_name, p.status, p.directory_visible
       FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE ($1 <> '' AND lower(p.email) = $1)
         OR ($2 <> '' AND right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10) = $2)
         OR ($3 <> '' AND trim(regexp_replace(translate(lower(p.full_name), $4, $5), '[^a-z0-9]+', ' ', 'g')) = $3)
      LIMIT 200`,
    [email, phone, name, ACCENTED, PLAIN],
  );

  const out: DuplicateCandidate[] = [];
  for (const row of rows) {
    if (options.excludeId && row.id === options.excludeId) continue;
    const reasons: DuplicateReason[] = [];
    if (email && normalizeEmail(row.email) === email) reasons.push("email");
    if (phone && phoneKey(row.phone) === phone) reasons.push("phone");
    if (name && normalizeName(row.full_name) === name) {
      reasons.push(org && normalizeName(row.organization_name) === org ? "name_org" : "name");
    }
    if (!reasons.length) continue;
    out.push({ ...row, reasons, score: reasons.reduce((sum, r) => sum + REASON_SCORE[r], 0) });
  }
  return out
    .sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name))
    .slice(0, Math.min(Math.max(options.limit ?? 10, 1), 50));
}

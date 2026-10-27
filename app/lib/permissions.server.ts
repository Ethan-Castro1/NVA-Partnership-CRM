/**
 * Who can see what. Two roles: admins see and manage everything; staff see
 * only people approved for the staff directory, never private CRM fields, and
 * reach a person's email or phone only when that person is set to 'direct'.
 *
 * Every loader, action and tool that takes or returns a person goes through
 * these checks (or the viewer-scoped functions in people.server.ts, which use
 * them). Hiding a button is never enough: check on the server.
 */
import { data } from "react-router";
import { requireAdmin } from "./auth.server";
import type { Role } from "./constants";
import { query, type Queryable } from "./db.server";
import type { SessionUser } from "./types";

/** Whoever is looking: enough of the signed-in user to decide what they may see. */
export type Viewer = Pick<SessionUser, "id" | "role">;

export const isAdmin = (viewer: Viewer): boolean => viewer.role === "admin";

/**
 * SQL boolean: the person row (by alias) is visible in the staff directory.
 * Use it in WHERE clauses for staff viewers: `WHERE ${staffVisibleSql("p")}`.
 */
export function staffVisibleSql(alias = "p"): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Bad SQL alias: ${alias}`);
  return `(${alias}.directory_visible AND ${alias}.status <> 'inactive')`;
}

/** SQL boolean for any viewer: always true for admins, the staff directory rule otherwise. */
export function visibleToSql(viewer: Viewer, alias = "p"): string {
  return isAdmin(viewer) ? "TRUE" : staffVisibleSql(alias);
}

/** Admins: the person exists. Staff: the person exists and is in the staff directory. */
export async function canViewPerson(viewer: Viewer, personId: string, db: Queryable = { query }): Promise<boolean> {
  if (!personId || personId.length > 100) return false;
  const rows = await db.query(`SELECT 1 FROM people p WHERE p.id = $1 AND ${visibleToSql(viewer, "p")}`, [personId]);
  return rows.length > 0;
}

/** Like canViewPerson, but throws a 404 (so a hidden person looks the same as a missing one). */
export async function requireVisiblePerson(viewer: Viewer, personId: string): Promise<void> {
  if (!(await canViewPerson(viewer, personId))) throw new Response("Not found", { status: 404 });
}

/** The ids from `personIds` this viewer may see (order kept, duplicates dropped). */
export async function visiblePersonIds(viewer: Viewer, personIds: string[], db: Queryable = { query }): Promise<string[]> {
  const unique = [...new Set(personIds.filter((id) => typeof id === "string" && id && id.length <= 100))];
  if (!unique.length) return [];
  const rows = await db.query<{ id: string }>(
    `SELECT p.id FROM people p WHERE p.id = ANY($1::text[]) AND ${visibleToSql(viewer, "p")}`,
    [unique],
  );
  const ok = new Set(rows.map((r) => r.id));
  return unique.filter((id) => ok.has(id));
}

/** App paths only admins may open. Matched case-insensitively, like the router. */
const ADMIN_ONLY_PATHS: RegExp[] = [
  /^\/app\/admin(?:[/.?#]|$)/,
  /^\/app\/opportunities(?:[/?#]|$)/,
  /^\/app\/follow-ups(?:[/?#]|$)/,
  /^\/app\/communications(?:[/?#]|$)/,
  /^\/app\/organizations(?:[/?#]|$)/,
  /^\/app\/people\/new(?:[/?#]|$)/,
  /^\/app\/people\/[^/?#]+\/(?:edit|email)(?:[/?#]|$)/,
];

/**
 * Whether someone with this role may open `path` (used to pick where to go
 * after sign-in). Admins may open anything; staff not the admin-only pages.
 * Pages still check on their own: this only avoids sending staff to a 403.
 */
export function canAccessPath(role: Role, path: string): boolean {
  if (role === "admin") return true;
  let normalized = path.trim().toLowerCase();
  try {
    normalized = decodeURI(normalized);
  } catch {
    // Leave undecodable paths as they are.
  }
  normalized = normalized.replace(/\/{2,}/g, "/");
  return !ADMIN_ONLY_PATHS.some((re) => re.test(normalized));
}

/** For admin-only loaders and actions: the signed-in admin, or a friendly 403. Same as requireAdmin. */
export async function requireAdminViewer(request: Request): Promise<SessionUser> {
  return requireAdmin(request);
}

/** A 404 that looks the same whether the record is missing or hidden. */
export function notFound(): never {
  throw data(null, { status: 404 });
}

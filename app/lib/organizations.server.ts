/**
 * Organizations (admin only): the list with people counts, and one
 * organization with its people and their open opportunities.
 */
import { OPEN_STAGES, type OrganizationKind } from "./constants";
import { query } from "./db.server";
import { listOpportunities, type OpportunityView } from "./opportunities.server";
import { searchPeople, type SearchHit } from "./people.server";
import { isAdmin, type Viewer } from "./permissions.server";
import { savedIdsAmong } from "./saved.server";

function requireAdminViewer(viewer: Viewer): void {
  if (!isAdmin(viewer)) throw new Response("Admins only", { status: 403, statusText: "Forbidden" });
}

export type OrganizationListItem = {
  id: string;
  name: string;
  kind: OrganizationKind;
  website: string | null;
  /** Everyone linked to it, hidden or not. */
  people_count: number;
  /** Of those, how many staff can see. */
  visible_count: number;
  open_opportunities: number;
};

const ORG_COLUMNS = `
  o.id, o.name, o.kind, o.website,
  (SELECT count(*)::int FROM people p WHERE p.organization_id = o.id) AS people_count,
  (SELECT count(*)::int FROM people p WHERE p.organization_id = o.id AND p.directory_visible AND p.status <> 'inactive') AS visible_count,
  (SELECT count(*)::int FROM opportunities op
     LEFT JOIN people pp ON pp.id = op.person_id
    WHERE (op.organization_id = o.id OR pp.organization_id = o.id) AND op.stage = ANY($1::text[])) AS open_opportunities`;

/** Organizations, largest first. `q` matches words in the name. Admin only. */
export async function listOrganizations(
  viewer: Viewer,
  options: { q?: string; limit?: number } = {},
): Promise<OrganizationListItem[]> {
  requireAdminViewer(viewer);
  const params: unknown[] = [[...OPEN_STAGES]];
  const where: string[] = [];
  for (const word of (options.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    params.push(`%${word.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`lower(o.name) LIKE $${params.length}`);
  }
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000);
  return query<OrganizationListItem>(
    `SELECT * FROM (SELECT ${ORG_COLUMNS} FROM organizations o ${where.length ? `WHERE ${where.join(" AND ")}` : ""}) x
      ORDER BY people_count DESC, lower(name) ASC LIMIT ${limit}`,
    params,
  );
}

export type OrganizationDetail = OrganizationListItem & {
  notes: string | null;
  people: SearchHit[];
  /** Which of `people` the viewer saved. */
  savedIds: string[];
  /** Open opportunities with anyone at this organization. */
  opportunities: OpportunityView[];
};

/** One organization with its people (inactive ones too) and their open opportunities. Admin only; null when missing. */
export async function getOrganization(viewer: Viewer, id: string): Promise<OrganizationDetail | null> {
  requireAdminViewer(viewer);
  if (!id || id.length > 100) return null;
  const rows = await query<OrganizationListItem & { notes: string | null }>(
    `SELECT ${ORG_COLUMNS}, o.notes FROM organizations o WHERE o.id = $2`,
    [[...OPEN_STAGES], id],
  );
  const org = rows[0];
  if (!org) return null;
  const { people } = await searchPeople({ organizationId: id, includeInactive: true, limit: 200 }, viewer);
  people.sort((a, b) => a.full_name.localeCompare(b.full_name));
  const [saved, perPerson] = await Promise.all([
    savedIdsAmong(
      viewer,
      people.map((p) => p.id),
    ),
    Promise.all(people.map((p) => listOpportunities(viewer, { personId: p.id, state: "open" }))),
  ]);
  const seen = new Set<string>();
  const opportunities = perPerson.flat().filter((o) => !seen.has(o.id) && seen.add(o.id));
  opportunities.sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"));
  return { ...org, people, savedIds: [...saved], opportunities };
}

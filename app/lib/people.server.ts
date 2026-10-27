/**
 * People, organizations, relationships and engagements: the core of the CRM.
 * Pages, the AI assistant's tools and the connection finder all go through
 * these functions so search results mean the same thing everywhere.
 *
 * Every read takes the viewer. Admins see everyone and every field. Staff see
 * only people in the staff directory (permissions.server.ts), never private
 * fields (notes, funding focus, origin, owner, source), and a person's email
 * and phone only when that person's contact mode is 'direct'.
 */
import {
  INNER_CIRCLE,
  WORK_KINDS,
  categoriesFor,
  normalizeTags,
  type Affiliation,
  type ContactCategory,
  type ContactMode,
  type ContributionType,
  type EngagementKind,
  type OrganizationKind,
  type PersonSource,
  type PersonStatus,
  type PreferredLanguage,
  type RelationshipKind,
} from "./constants";
import { newId, query, type Queryable } from "./db.server";
import { defaultVisibility, listHistory, recordHistory, type HistoryView } from "./history.server";
import { isAdmin, staffVisibleSql, visibleToSql, type Viewer } from "./permissions.server";

export type { Viewer } from "./permissions.server";

export type PersonSummary = {
  id: string;
  full_name: string;
  /** Null for staff unless the person is set to direct contact. */
  email: string | null;
  /** Null for staff unless the person is set to direct contact. */
  phone: string | null;
  title: string | null;
  organization_id: string | null;
  organization_name: string | null;
  skills: string[];
  cap_topics: string[];
  contribution_types: ContributionType[];
  affiliations: Affiliation[];
  status: PersonStatus;
  preferred_language: PreferredLanguage;
  availability: string | null;
  location: string | null;
  categories: ContactCategory[];
  directory_visible: boolean;
  contact_mode: ContactMode;
  /** Admin only: null for staff. */
  source: PersonSource | null;
  updated_at: string;
};

/** One person as a viewer may see them. Admin-only fields are null for staff. */
export type PersonView = PersonSummary & {
  bio: string | null;
  /** Written by an admin for staff to read. */
  shared_summary: string | null;
  created_at: string;
  approved_at: string | null;
  organization_kind: OrganizationKind | null;
  organization_website: string | null;
  /** Admin only: private notes. */
  notes: string | null;
  /** Admin only. Funders: what they fund, typical amounts, deadlines. */
  funding_focus: string | null;
  /** Admin only: how the relationship began. */
  origin: string | null;
  /** Admin only: who owns the relationship. */
  owner_user_id: string | null;
  owner_name: string | null;
};
/** @deprecated Same as PersonView. */
export type PersonDetail = PersonView;

export type MiniPerson = Pick<
  PersonSummary,
  "id" | "full_name" | "title" | "organization_name" | "affiliations" | "status"
>;

/** Columns for PersonSummary, redacted for staff in SQL so private values never leave the database. */
function summaryColumns(viewer: Viewer): string {
  const admin = isAdmin(viewer);
  const contact = (column: "email" | "phone") =>
    admin ? `p.${column}` : `CASE WHEN p.contact_mode = 'direct' THEN p.${column} END AS ${column}`;
  return `
  p.id, p.full_name, ${contact("email")}, ${contact("phone")}, p.title, p.organization_id, o.name AS organization_name,
  p.skills, p.cap_topics, p.contribution_types, p.affiliations, p.status, p.preferred_language,
  p.availability, p.location, p.categories, p.directory_visible, p.contact_mode,
  ${admin ? "p.source" : "NULL::text AS source"}, p.updated_at`;
}

/** The extra PersonView columns (needs `LEFT JOIN users ow ON ow.id = p.owner_user_id`). */
function detailColumns(viewer: Viewer): string {
  const admin = isAdmin(viewer);
  const priv = (expr: string, name: string) => (admin ? `${expr} AS ${name}` : `NULL::text AS ${name}`);
  return `p.bio, p.shared_summary, p.created_at, p.approved_at, o.kind AS organization_kind, o.website AS organization_website,
  ${priv("p.notes", "notes")}, ${priv("p.funding_focus", "funding_focus")}, ${priv("p.origin", "origin")},
  ${priv("p.owner_user_id", "owner_user_id")}, ${priv("ow.name", "owner_name")}`;
}

// ---------- search ----------

export type PeopleFilter = {
  /** Free text: "sewing", "someone at the hospital", "welding internship". */
  q?: string;
  contributionTypes?: string[];
  affiliations?: string[];
  statuses?: string[];
  skills?: string[];
  capTopics?: string[];
  /** CRM categories (any of). */
  categories?: string[];
  /** Only people who prefer this language (or both). */
  language?: "en" | "es";
  organizationId?: string;
  includeInactive?: boolean;
  /** Admin filters (ignored for staff, who only ever see the staff directory). */
  directoryVisible?: boolean;
  contactMode?: ContactMode;
  ownerUserId?: string;
  limit?: number;
  offset?: number;
};

export type SearchHit = PersonSummary & { score: number; matched: string[] };

const STOPWORDS = new Set(
  (
    "a an and are at be by can could for from has have i in is it me my need of on or our someone somebody " +
    "teach teaches teacher that the their them they this to us we who with would anyone people person " +
    "partner partners help find looking about " +
    "un una unos unas el la los las y o de del en con para por que quien quién alguien persona personas " +
    "necesito buscar busco sobre nuestro nuestra ayuda"
  ).split(" "),
);

/** Splits free text into search terms: lowercase, no stopwords, light de-pluralizing. */
export function searchTerms(q: string | undefined): string[] {
  if (!q) return [];
  const terms = new Set<string>();
  for (const raw of q.toLowerCase().split(/[^\p{L}\p{N}&+#-]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    terms.add(raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw);
  }
  return [...terms].slice(0, 8);
}

/**
 * Ranked search. Each term scores: skill 4, CAP topic 3, name 3, title or
 * organization 2, about/summary/location/availability 1 (admins: private notes
 * and funding focus count too; staff rankings never use private fields). With a
 * q, only people matching at least one term come back; without one, everyone
 * matching the filters does, most recently updated first.
 */
export async function searchPeople(
  filter: PeopleFilter,
  viewer: Viewer,
): Promise<{ people: SearchHit[]; total: number }> {
  const admin = isAdmin(viewer);
  const params: unknown[] = [];
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where: string[] = admin ? [] : [staffVisibleSql("p")];
  const terms = searchTerms(filter.q);

  // Text that counts 1 point. Staff never match on private fields.
  const looseText = admin
    ? "coalesce(p.bio, '') || ' ' || coalesce(p.shared_summary, '') || ' ' || coalesce(p.location, '') || ' ' || coalesce(p.availability, '') || ' ' || coalesce(p.notes, '') || ' ' || coalesce(p.funding_focus, '') || ' ' || coalesce(p.origin, '')"
    : "coalesce(p.bio, '') || ' ' || coalesce(p.shared_summary, '') || ' ' || coalesce(p.location, '') || ' ' || coalesce(p.availability, '')";
  const scoreParts = terms.map((term) => {
    const like = p(`%${term}%`);
    return `(CASE WHEN EXISTS (SELECT 1 FROM unnest(p.skills) s WHERE s ILIKE ${like}) THEN 4 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM unnest(p.cap_topics) s WHERE s ILIKE ${like}) THEN 3 ELSE 0 END
      + CASE WHEN p.full_name ILIKE ${like} THEN 3 ELSE 0 END
      + CASE WHEN coalesce(p.title, '') ILIKE ${like} OR coalesce(o.name, '') ILIKE ${like} THEN 2 ELSE 0 END
      + CASE WHEN ${looseText} ILIKE ${like} THEN 1 ELSE 0 END)`;
  });
  const score = scoreParts.length ? scoreParts.join(" + ") : "0";

  if (filter.contributionTypes?.length) where.push(`p.contribution_types && ${p(filter.contributionTypes)}::text[]`);
  if (filter.affiliations?.length) where.push(`p.affiliations && ${p(filter.affiliations)}::text[]`);
  if (filter.skills?.length) where.push(`p.skills && ${p(normalizeTags(filter.skills))}::text[]`);
  if (filter.capTopics?.length) where.push(`p.cap_topics && ${p(normalizeTags(filter.capTopics))}::text[]`);
  if (filter.categories?.length) where.push(`p.categories && ${p(filter.categories)}::text[]`);
  if (filter.statuses?.length) where.push(`p.status = ANY(${p(filter.statuses)}::text[])`);
  else if (!filter.includeInactive) where.push(`p.status <> 'inactive'`);
  if (filter.language) where.push(`p.preferred_language IN (${p(filter.language)}, 'both')`);
  if (filter.organizationId) where.push(`p.organization_id = ${p(filter.organizationId)}`);
  if (admin && filter.directoryVisible !== undefined) where.push(`p.directory_visible = ${p(filter.directoryVisible)}`);
  if (admin && filter.contactMode) where.push(`p.contact_mode = ${p(filter.contactMode)}`);
  if (admin && filter.ownerUserId) where.push(`p.owner_user_id = ${p(filter.ownerUserId)}`);

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT * FROM (
      SELECT ${summaryColumns(viewer)}, (${score})::int AS score, count(*) OVER () AS total
        FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
       ${whereSql}
    ) ranked
    ${terms.length ? "WHERE score > 0" : ""}
    ORDER BY ${terms.length ? "score DESC," : ""} updated_at DESC, full_name ASC
    LIMIT ${limit} OFFSET ${offset}`;

  // count(*) OVER () counts before the score filter, so count matches separately when searching.
  const rows = await query<SearchHit & { total: string | number }>(sql, params);
  let total = rows.length ? Number(rows[0].total) : 0;
  if (terms.length) {
    const countRows = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM (
         SELECT (${score}) AS score FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
         ${whereSql}) s WHERE score > 0`,
      params,
    );
    total = countRows[0]?.n ?? rows.length;
  }

  return {
    total,
    people: rows.map(({ total: _total, ...row }) => ({
      ...row,
      score: Number(row.score),
      matched: terms.length
        ? [...new Set([...row.skills, ...row.cap_topics])].filter((tag) => terms.some((term) => tag.includes(term)))
        : [],
    })),
  };
}

// ---------- one person ----------

/** One person, or null when they don't exist or this viewer may not see them. */
export async function getPerson(id: string, viewer: Viewer, db: Queryable = { query }): Promise<PersonView | null> {
  if (!id || id.length > 100) return null;
  const rows = await db.query<PersonView>(
    `SELECT ${summaryColumns(viewer)}, ${detailColumns(viewer)}
       FROM people p
       LEFT JOIN organizations o ON o.id = p.organization_id
       LEFT JOIN users ow ON ow.id = p.owner_user_id
      WHERE p.id = $1 AND ${visibleToSql(viewer, "p")}`,
    [id],
  );
  return rows[0] ?? null;
}

/** The people with these ids that this viewer may see (in no particular order). */
export async function getPeopleByIds(ids: string[], viewer: Viewer): Promise<PersonSummary[]> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id && id.length <= 100))];
  if (!wanted.length) return [];
  return query<PersonSummary>(
    `SELECT ${summaryColumns(viewer)} FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE p.id = ANY($1::text[]) AND ${visibleToSql(viewer, "p")}`,
    [wanted],
  );
}

/** Admin and internal use: the record with this email, hidden or not. */
export async function findPersonByEmail(email: string, db: Queryable = { query }): Promise<{ id: string } | null> {
  const rows = await db.query<{ id: string }>("SELECT id FROM people WHERE lower(email) = lower($1) LIMIT 1", [
    email.trim(),
  ]);
  return rows[0] ?? null;
}

export type PersonInput = {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  preferred_language?: PreferredLanguage;
  organization_name?: string | null;
  organization_kind?: OrganizationKind;
  title?: string | null;
  bio?: string | null;
  skills?: string[] | string;
  cap_topics?: string[] | string;
  contribution_types?: ContributionType[];
  affiliations?: Affiliation[];
  availability?: string | null;
  status?: PersonStatus;
  source?: PersonSource;
  notes?: string | null;
  funding_focus?: string | null;
  /** CRM categories. On create, defaults to the ones implied by ways to help and organization kind. */
  categories?: ContactCategory[];
  /** Shown in the staff directory. Defaults to false: new people start hidden until an admin approves them. */
  directory_visible?: boolean;
  /** Defaults to 'introduction'. */
  contact_mode?: ContactMode;
  owner_user_id?: string | null;
  origin?: string | null;
  shared_summary?: string | null;
  location?: string | null;
};

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Finds an organization by name (case-insensitive) or creates it. */
export async function upsertOrganization(
  name: string | null | undefined,
  kind: OrganizationKind = "other",
  db: Queryable = { query },
): Promise<string | null> {
  const clean = blank(name);
  if (!clean) return null;
  const existing = await db.query<{ id: string }>("SELECT id FROM organizations WHERE lower(name) = lower($1)", [clean]);
  if (existing[0]) return existing[0].id;
  const id = newId();
  await db.query(
    "INSERT INTO organizations (id, name, kind) VALUES ($1, $2, $3) ON CONFLICT ((lower(name))) DO NOTHING",
    [id, clean, kind],
  );
  const row = await db.query<{ id: string }>("SELECT id FROM organizations WHERE lower(name) = lower($1)", [clean]);
  return row[0]?.id ?? null;
}

export async function createPerson(input: PersonInput, createdBy: string | null, db: Queryable = { query }): Promise<string> {
  const id = newId();
  const orgId = await upsertOrganization(input.organization_name, input.organization_kind, db);
  const visible = input.directory_visible === true;
  await db.query(
    `INSERT INTO people (id, full_name, email, phone, preferred_language, organization_id, title, bio, skills,
                         cap_topics, contribution_types, affiliations, availability, status, source, notes, created_by,
                         funding_focus, categories, directory_visible, contact_mode, owner_user_id, origin, shared_summary,
                         location, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
             CASE WHEN $20::boolean THEN now() END)`,
    [
      id,
      input.full_name.trim(),
      blank(input.email)?.toLowerCase() ?? null,
      blank(input.phone),
      input.preferred_language ?? "en",
      orgId,
      blank(input.title),
      blank(input.bio),
      normalizeTags(input.skills),
      normalizeTags(input.cap_topics),
      input.contribution_types ?? [],
      input.affiliations ?? [],
      blank(input.availability),
      input.status ?? "new",
      input.source ?? "admin",
      blank(input.notes),
      createdBy,
      blank(input.funding_focus),
      input.categories ?? categoriesFor(input.contribution_types ?? [], input.organization_name ? input.organization_kind : null),
      visible,
      input.contact_mode ?? "introduction",
      input.owner_user_id ?? null,
      blank(input.origin),
      blank(input.shared_summary),
      blank(input.location),
    ],
  );
  return id;
}

/** Updates only the fields present in `input`. Approving someone for the directory stamps approved_at once. */
export async function updatePerson(id: string, input: Partial<PersonInput>, db: Queryable = { query }): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (input.full_name !== undefined) set("full_name", input.full_name.trim());
  if (input.email !== undefined) set("email", blank(input.email)?.toLowerCase() ?? null);
  if (input.phone !== undefined) set("phone", blank(input.phone));
  if (input.preferred_language !== undefined) set("preferred_language", input.preferred_language);
  if (input.organization_name !== undefined)
    set("organization_id", await upsertOrganization(input.organization_name, input.organization_kind, db));
  if (input.title !== undefined) set("title", blank(input.title));
  if (input.bio !== undefined) set("bio", blank(input.bio));
  if (input.skills !== undefined) set("skills", normalizeTags(input.skills));
  if (input.cap_topics !== undefined) set("cap_topics", normalizeTags(input.cap_topics));
  if (input.contribution_types !== undefined) set("contribution_types", input.contribution_types);
  if (input.affiliations !== undefined) set("affiliations", input.affiliations);
  if (input.availability !== undefined) set("availability", blank(input.availability));
  if (input.status !== undefined) set("status", input.status);
  if (input.source !== undefined) set("source", input.source);
  if (input.notes !== undefined) set("notes", blank(input.notes));
  if (input.funding_focus !== undefined) set("funding_focus", blank(input.funding_focus));
  if (input.categories !== undefined) set("categories", input.categories);
  if (input.directory_visible !== undefined) {
    set("directory_visible", input.directory_visible);
    if (input.directory_visible) sets.push("approved_at = coalesce(approved_at, now())");
  }
  if (input.contact_mode !== undefined) set("contact_mode", input.contact_mode);
  if (input.owner_user_id !== undefined) set("owner_user_id", input.owner_user_id);
  if (input.origin !== undefined) set("origin", blank(input.origin));
  if (input.shared_summary !== undefined) set("shared_summary", blank(input.shared_summary));
  if (input.location !== undefined) set("location", blank(input.location));
  if (!sets.length) return;
  await db.query(`UPDATE people SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
}

export async function deletePerson(id: string): Promise<void> {
  await query("DELETE FROM people WHERE id = $1", [id]);
}

// ---------- relationships ----------

export type RelationshipView = {
  id: string;
  kind: RelationshipKind;
  note: string | null;
  source: string;
  /** 'out': this person → other (e.g. this person referred them). 'in': other → this person. */
  direction: "out" | "in";
  other: MiniPerson;
  created_at: string;
};

export async function addRelationship(
  input: { personId: string; relatedPersonId: string; kind: RelationshipKind; note?: string | null; source?: "intake" | "admin" | "web" },
  createdBy: string | null,
  db: Queryable = { query },
): Promise<void> {
  if (input.personId === input.relatedPersonId) return;
  await db.query(
    `INSERT INTO relationships (id, person_id, related_person_id, kind, note, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (person_id, related_person_id, kind) DO UPDATE SET note = coalesce(EXCLUDED.note, relationships.note)`,
    [newId(), input.personId, input.relatedPersonId, input.kind, blank(input.note), input.source ?? "admin", createdBy],
  );
}

export async function removeRelationship(id: string): Promise<void> {
  await query("DELETE FROM relationships WHERE id = $1", [id]);
}

/**
 * Everyone this person is linked to. Staff get nothing for a person they
 * can't see, and only links to people they can see.
 */
export async function getRelationships(personId: string, viewer: Viewer): Promise<RelationshipView[]> {
  const admin = isAdmin(viewer);
  const rows = await query<{
    id: string; kind: RelationshipKind; note: string | null; source: string; direction: "out" | "in"; created_at: string;
    other_id: string; full_name: string; title: string | null; organization_name: string | null; affiliations: Affiliation[]; status: PersonStatus;
  }>(
    `SELECT r.id, r.kind, r.note, r.source, r.created_at,
            CASE WHEN r.person_id = $1 THEN 'out' ELSE 'in' END AS direction,
            p.id AS other_id, p.full_name, p.title, o.name AS organization_name, p.affiliations, p.status
       FROM relationships r
       JOIN people p ON p.id = CASE WHEN r.person_id = $1 THEN r.related_person_id ELSE r.person_id END
       LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE (r.person_id = $1 OR r.related_person_id = $1)
        ${admin ? "" : `AND ${staffVisibleSql("p")} AND EXISTS (SELECT 1 FROM people self WHERE self.id = $1 AND ${staffVisibleSql("self")})`}
      ORDER BY r.created_at DESC`,
    [personId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    note: r.note,
    source: r.source,
    direction: r.direction,
    created_at: r.created_at,
    other: {
      id: r.other_id,
      full_name: r.full_name,
      title: r.title,
      organization_name: r.organization_name,
      affiliations: r.affiliations,
      status: r.status,
    },
  }));
}

// ---------- the connection finder ----------

export type PathEdge = { kind: RelationshipKind; note: string | null };

/**
 * A way to reach `target`: chain[0] is someone in NVA's inner circle (board or
 * staff), chain[last] is the target, and edges[i] links chain[i] and chain[i+1].
 * degree 1 = the connector knows the target directly; degree 2 = through one
 * person in between.
 */
export type IntroPath = { degree: 1 | 2; chain: MiniPerson[]; edges: PathEdge[] };

type Graph = { people: Map<string, MiniPerson>; adj: Map<string, { to: string; edge: PathEdge }[]> };

/** The village as a graph. For staff, only people in the staff directory and the links between them. */
async function loadGraph(viewer: Viewer): Promise<Graph> {
  const [people, edges] = await Promise.all([
    query<MiniPerson>(
      `SELECT p.id, p.full_name, p.title, o.name AS organization_name, p.affiliations, p.status
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE ${visibleToSql(viewer, "p")}`,
    ),
    query<{ person_id: string; related_person_id: string; kind: RelationshipKind; note: string | null }>(
      "SELECT person_id, related_person_id, kind, note FROM relationships",
    ),
  ]);
  const graph: Graph = { people: new Map(people.map((p) => [p.id, p])), adj: new Map() };
  for (const e of edges) {
    // A link to someone this viewer can't see is no path at all.
    if (!graph.people.has(e.person_id) || !graph.people.has(e.related_person_id)) continue;
    const edge = { kind: e.kind, note: e.note };
    if (!graph.adj.has(e.person_id)) graph.adj.set(e.person_id, []);
    if (!graph.adj.has(e.related_person_id)) graph.adj.set(e.related_person_id, []);
    graph.adj.get(e.person_id)!.push({ to: e.related_person_id, edge });
    graph.adj.get(e.related_person_id)!.push({ to: e.person_id, edge });
  }
  return graph;
}

const isInner = (p: MiniPerson | undefined) => !!p && p.affiliations.some((a) => INNER_CIRCLE.includes(a));

function pathsTo(graph: Graph, targetId: string): IntroPath[] {
  const target = graph.people.get(targetId);
  if (!target) return [];
  const paths: IntroPath[] = [];
  for (const first of graph.adj.get(targetId) ?? []) {
    const mid = graph.people.get(first.to);
    if (!mid) continue;
    if (isInner(mid)) paths.push({ degree: 1, chain: [mid, target], edges: [first.edge] });
    for (const second of graph.adj.get(first.to) ?? []) {
      if (second.to === targetId) continue;
      const connector = graph.people.get(second.to);
      if (isInner(connector)) {
        paths.push({ degree: 2, chain: [connector!, mid, target], edges: [second.edge, first.edge] });
      }
    }
  }
  // Closest first, and one path per connector+middle pair.
  const seen = new Set<string>();
  return paths
    .sort((a, b) => a.degree - b.degree)
    .filter((path) => {
      const key = path.chain.map((p) => p.id).join(">");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** How NVA's board and staff can reach one person (for staff: only through people they can see). */
export async function findIntroPaths(targetId: string, viewer: Viewer): Promise<IntroPath[]> {
  return pathsTo(await loadGraph(viewer), targetId);
}

/**
 * For a need ("someone who can teach welding"): the matching people, each with
 * the ways the inner circle can reach them. Inner-circle matches get an empty
 * paths list (they can be asked directly).
 */
export async function findConnectorsForNeed(
  filter: PeopleFilter,
  viewer: Viewer,
): Promise<{ person: SearchHit; direct: boolean; paths: IntroPath[] }[]> {
  const [{ people }, graph] = await Promise.all([
    searchPeople({ ...filter, limit: filter.limit ?? 25 }, viewer),
    loadGraph(viewer),
  ]);
  return people.map((person) => ({
    person,
    direct: isInner(graph.people.get(person.id)),
    paths: pathsTo(graph, person.id),
  }));
}

/** Everyone and every link this viewer may see, for drawing the village map. */
export async function getNetwork(
  viewer: Viewer,
  limit = 400,
): Promise<{
  nodes: (MiniPerson & { contribution_types: ContributionType[] })[];
  links: { source: string; target: string; kind: RelationshipKind }[];
}> {
  const nodes = await query<MiniPerson & { contribution_types: ContributionType[] }>(
    `SELECT p.id, p.full_name, p.title, o.name AS organization_name, p.affiliations, p.status, p.contribution_types
       FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
      WHERE p.status <> 'inactive' AND ${visibleToSql(viewer, "p")}
      ORDER BY p.updated_at DESC LIMIT $1`,
    [limit],
  );
  const ids = new Set(nodes.map((n) => n.id));
  const links = (
    await query<{ source: string; target: string; kind: RelationshipKind }>(
      "SELECT person_id AS source, related_person_id AS target, kind FROM relationships",
    )
  ).filter((l) => ids.has(l.source) && ids.has(l.target));
  return { nodes, links };
}

// ---------- engagements (the history) ----------

/** One history entry as a profile shows it (see history.server.ts). */
export type EngagementView = HistoryView;

/**
 * Manual logging from a profile ("Log activity"): who did it, what, when.
 * The work itself (lessons, volunteering, internships, guest talks) is shared
 * with staff and moves a lead or new contact to active; calls, meetings and
 * notes stay admin-only. Callers check who may log what (STAFF_LOGGABLE_KINDS).
 */
export async function logEngagement(
  input: { personId: string; kind: EngagementKind; happenedOn?: string | null; notes?: string | null; capId?: string | null },
  userId: string | null,
  db: Queryable = { query },
): Promise<string> {
  return recordHistory(
    {
      personId: input.personId,
      kind: input.kind,
      happenedOn: blank(input.happenedOn),
      notes: input.notes,
      capId: input.capId ?? null,
      userId,
      origin: "manual",
      visibility: defaultVisibility(input.kind),
      promoteStatus: (WORK_KINDS as readonly string[]).includes(input.kind),
    },
    db,
  );
}

/** A person's history as this viewer may see it, newest first. */
export async function getEngagements(personId: string, viewer: Viewer): Promise<EngagementView[]> {
  return listHistory(personId, viewer);
}

export async function deleteEngagement(id: string): Promise<void> {
  await query("DELETE FROM engagements WHERE id = $1", [id]);
}

// ---------- counts for dashboards ----------

/** Directory numbers. Staff counts cover only the staff directory (and no sign-ups or leads). */
export async function getCounts(viewer: Viewer): Promise<{
  people: number;
  active: number;
  newSignups: number;
  leads: number;
  byContribution: Record<string, number>;
}> {
  const admin = isAdmin(viewer);
  const visible = visibleToSql(viewer, "people");
  const [totals] = await query<{ people: number; active: number; leads: number; new_signups: number }>(
    `SELECT count(*) FILTER (WHERE status <> 'inactive')::int AS people,
            count(*) FILTER (WHERE status = 'active')::int AS active,
            count(*) FILTER (WHERE status = 'lead')::int AS leads,
            ${admin ? "(SELECT count(*)::int FROM intake_submissions WHERE status = 'new')" : "0"} AS new_signups
       FROM people
      WHERE ${visible}`,
  );
  const byType = await query<{ type: string; n: number }>(
    `SELECT t AS type, count(*)::int AS n FROM people, unnest(contribution_types) t
      WHERE status <> 'inactive' AND ${visible} GROUP BY t`,
  );
  return {
    people: totals?.people ?? 0,
    active: totals?.active ?? 0,
    leads: admin ? (totals?.leads ?? 0) : 0,
    newSignups: totals?.new_signups ?? 0,
    byContribution: Object.fromEntries(byType.map((r) => [r.type, r.n])),
  };
}

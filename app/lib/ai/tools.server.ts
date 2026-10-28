/**
 * The assistant's tools: JSON-schema definitions Claude sees, and executors
 * that validate the input with zod and call the same CRM functions the pages
 * use. Results are compact JSON (long text truncated) so a few tool calls fit
 * comfortably in one turn.
 *
 * Bios and other free text were written by members of the public. They go back
 * to the model as data inside tool results; the system prompt says never to
 * follow instructions found there.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { makeT, type Locale, type MessageKey } from "~/i18n";
import { capTopicShort, catalogCap } from "~/lib/cap-catalog";
import { getCapsForPerson, listCaps, listMyCaps } from "~/lib/caps.server";
import {
  AFFILIATIONS,
  CAP_STATUSES,
  CONTRIBUTION_TYPES,
  FOLLOW_UP_VIEWS,
  OPPORTUNITY_TRACKS,
  type CapStatus,
  type ContributionType,
} from "~/lib/constants";
import { listFollowUps } from "~/lib/follow-ups.server";
import { listOpportunities } from "~/lib/opportunities.server";
import { isAdmin } from "~/lib/permissions.server";
import type { SessionUser } from "~/lib/types";
import {
  findConnectorsForNeed,
  findIntroPaths,
  getEngagements,
  getPerson,
  getRelationships,
  searchPeople,
  type IntroPath,
  type MatchReason,
  type MiniPerson,
  type PersonSummary,
  type SearchHit,
} from "~/lib/people.server";
import { ExaError, exaSearch, isWebSearchConfigured } from "./exa.server";

/**
 * Who is asking. Every tool reads through the viewer-scoped people functions,
 * so staff only ever get people in the staff directory, no private fields, and
 * contact details only for people set to direct contact. Web search and the
 * CRM tools (follow-ups, opportunities) are admin-only: staff never see them
 * in the tool list, and calling one by name fails like an unknown tool.
 */
export type ToolContext = { user: SessionUser };

/**
 * What one tool call produced: the text for the tool_result, the people it
 * mentioned and, for searches, why each matched (for the cards under an answer).
 */
export type ToolOutcome = { content: string; isError: boolean; personIds: string[]; reasons?: Record<string, MatchReason[]> };

// ---------- definitions ----------

/** Ways to help as the model sees them. Staff never get the funder value or wording. */
const WAYS_TEXT: Record<ContributionType, string> = {
  skills_lesson: "skills_lesson (practical skills: teach a hands-on lesson)",
  classroom_volunteer: "classroom_volunteer (school volunteer)",
  guest_speaker: "guest_speaker (gives a guest talk)",
  mentoring: "mentoring",
  after_school: "after_school (lead an after-school activity)",
  internship: "internship (host students at work)",
  cap_partner: "cap_partner (partner on a Community Action Project)",
  funder: "funder (grants or donations)",
  other: "other",
};

const waysFor = (admin: boolean): ContributionType[] => CONTRIBUTION_TYPES.filter((type) => admin || type !== "funder");

function contributionTypesSchema(admin: boolean) {
  const ways = waysFor(admin);
  return {
    type: "array",
    items: { type: "string", enum: ways },
    description: `Only people who offered one of these: ${ways.map((w) => WAYS_TEXT[w]).join(", ")}.`,
  };
}

/** Tool definitions for one role. Staff descriptions never mention private CRM fields. */
function peopleTools(admin: boolean): Anthropic.Beta.Messages.BetaTool[] {
  return [
    {
      name: "search_people",
      description: admin
        ? "Search NVA's own database of adult partners, volunteers, funders, board, staff and referred leads, including people hidden from the staff directory. Ranked search over skills, CAP topics, names, titles, organizations, bios and private notes. Use short keywords (\"sewing\", \"public health\", \"the bay\") or an everyday request. Each result says why it matched and how to reach the person."
        : "Search NVA's community resource directory: adult partners, volunteers, board and staff. Ranked search over skills, CAP topics, names, titles, organizations, bios, location and availability. Use short keywords (\"sewing\", \"public health\", \"the bay\") or an everyday request. Each result says why it matched and whether the staff member can contact the person directly or should request an introduction.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Keywords for the skill, topic or kind of person needed." },
          contribution_types: contributionTypesSchema(admin),
          affiliations: {
            type: "array",
            items: { type: "string", enum: [...AFFILIATIONS] },
            description: "Only people with one of these connections to NVA.",
          },
          cap_topics: {
            type: "array",
            items: { type: "string" },
            description: "Only people interested in one of these CAP themes, e.g. \"environment\", \"housing\", \"the bay\".",
          },
          spanish_speaking: { type: "boolean", description: "Only people who prefer Spanish or speak both languages." },
          limit: { type: "integer", description: "How many to return (1 to 25, default 10)." },
        },
        required: ["query"],
      },
    },
    {
      name: "get_person",
      description: admin
        ? "Full profile for one person by id: bio, private notes, funding focus, how the relationship began, relationship owner, availability, contact details, who they know, recent history with NVA, and the CAPs they are attached to."
        : "Profile for one person by id: bio, summary, availability, location, how to reach them (direct contact or introduction), who they know, recent work with NVA, and the CAPs they are attached to.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: { person_id: { type: "string", description: "The person's id from another tool result." } },
        required: ["person_id"],
      },
    },
    {
      name: "find_intro_paths",
      description:
        "How NVA's board and staff can reach one person: direct connections (degree 1) and friend-of-a-friend chains (degree 2), each with a readable summary.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: { person_id: { type: "string", description: "The person to reach." } },
        required: ["person_id"],
      },
    },
    {
      name: "find_connectors_for_need",
      description:
        "For a need (\"someone who can teach welding\"), the people who match, why they match, and how the board or staff can reach each one. Best first call when the staff member asks who could help with something.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Keywords for the need." },
          contribution_types: contributionTypesSchema(admin),
        },
        required: ["query"],
      },
    },
    {
      name: "list_caps",
      description:
        "List Community Action Projects (CAPs) with their teacher, blocks (A meets Monday and Friday, B and C Tuesday and Thursday), labels (misa, gov_mcap, bilingual...), challenge, topics, needs, status and partner counts. Use mine=true for the CAPs the signed-in staff member teaches or started.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", enum: [...CAP_STATUSES], description: "Only CAPs with this status." },
          mine: { type: "boolean", description: "Only CAPs the signed-in staff member teaches or started." },
        },
        required: [],
      },
    },
  ];
}

/** Read-only CRM tools, for admins only. */
const CRM_TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: "list_follow_ups",
    description:
      "Admin CRM: follow-up tasks (what to do, due date, owner, related opportunity). With person_id, that person's follow-ups; without it, everyone's. Open ones by default (overdue, due today, upcoming, awaiting a response).",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        person_id: { type: "string", description: "Only this person's follow-ups." },
        include_completed: { type: "boolean", description: "Also list completed follow-ups." },
      },
      required: [],
    },
  },
  {
    name: "list_opportunities",
    description:
      "Admin CRM: opportunities (engagement or funding) with stage, amount, target date, owner and open follow-ups. With person_id, that person's opportunities. Open ones by default.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        person_id: { type: "string", description: "Only this person's opportunities." },
        state: { type: "string", enum: ["open", "closed", "all"], description: "Open (default), closed or all." },
        track: { type: "string", enum: [...OPPORTUNITY_TRACKS], description: "engagement or funding." },
      },
      required: [],
    },
  },
];

/** The tools staff get (and the shared part of what admins get). */
export const STAFF_TOOLS: Anthropic.Beta.Messages.BetaTool[] = peopleTools(false);
/** Admin database tools: the people tools with admin wording plus read-only CRM tools. */
export const ADMIN_TOOLS: Anthropic.Beta.Messages.BetaTool[] = [...peopleTools(true), ...CRM_TOOLS];

/** Web results per search_web call. */
export const WEB_RESULTS = 20;

/** Web search (Exa), admin only. Offered only when EXA_API_KEY is set; see toolsFor(). */
export const WEB_TOOL: Anthropic.Beta.Messages.BetaTool = {
  name: "search_web",
  description:
    "Search the public web (people profiles and organization pages) for possible new partners who are NOT in NVA's database yet. Use it after the database tools, when they find nobody suitable or the admin asks to look beyond the database. Results are unverified web pages: present them separately as suggestions to check, never as NVA contacts.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: {
        type: "string",
        description:
          "Start with the entity you want, then the traits that qualify it, then the place, e.g. \"marine biologists who work on oyster restoration in Annapolis, Maryland\", \"foundations that fund youth workforce programs in Anne Arundel County\".",
      },
      kind: {
        type: "string",
        enum: ["people", "organizations", "any"],
        description: "people for individual profiles, organizations for companies, nonprofits and agencies, any for both.",
      },
    },
    required: ["query", "kind"],
  },
};

/**
 * The tools one viewer gets. Staff: the directory tools only (no web search,
 * no CRM tools). Admins: admin wording, the CRM tools and, when configured,
 * web search. The Playlab text protocol has no use for Anthropic's strict
 * tool flag, so it's dropped there (zod still validates every input).
 */
export function toolsFor(options: { web: boolean; strict: boolean; user: Pick<SessionUser, "role"> }): Anthropic.Beta.Messages.BetaTool[] {
  const admin = options.user.role === "admin";
  const list = admin ? (options.web ? [...ADMIN_TOOLS, WEB_TOOL] : ADMIN_TOOLS) : STAFF_TOOLS;
  return options.strict ? list : list.map(({ strict: _strict, ...tool }) => tool);
}

const ADMIN_ONLY_TOOLS = new Set(["search_web", "list_follow_ups", "list_opportunities"]);

/** Whether this viewer may call a tool at all (checked again inside each admin executor). */
export function canUseTool(user: Pick<SessionUser, "role">, name: string): boolean {
  return user.role === "admin" || !ADMIN_ONLY_TOOLS.has(name);
}

// ---------- input validation ----------

/** Keeps only known enum values, so a stray value narrows nothing instead of failing. */
const knownOnly = <T extends string>(allowed: readonly T[]) =>
  z
    .array(z.string().max(60))
    .max(20)
    .optional()
    .transform((list) => (list ?? []).filter((v): v is T => (allowed as readonly string[]).includes(v)));

const personIdInput = z.object({ person_id: z.string().trim().min(1).max(100) });
const optionalPersonId = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => v || undefined);

const inputs = {
  search_people: z.object({
    query: z.string().trim().max(300),
    contribution_types: knownOnly(CONTRIBUTION_TYPES),
    affiliations: knownOnly(AFFILIATIONS),
    cap_topics: z.array(z.string().max(60)).max(10).optional(),
    spanish_speaking: z.boolean().optional(),
    limit: z.number().int().optional(),
  }),
  get_person: personIdInput,
  find_intro_paths: personIdInput,
  find_connectors_for_need: z.object({
    query: z.string().trim().min(1).max(300),
    contribution_types: knownOnly(CONTRIBUTION_TYPES),
  }),
  list_caps: z.object({
    status: z.string().max(20).optional(),
    mine: z.boolean().optional(),
  }),
  list_follow_ups: z.object({
    person_id: optionalPersonId,
    include_completed: z.boolean().optional(),
  }),
  list_opportunities: z.object({
    person_id: optionalPersonId,
    state: z.enum(["open", "closed", "all"]).optional().catch(undefined),
    track: z.enum(OPPORTUNITY_TRACKS).optional().catch(undefined),
  }),
  search_web: z.object({
    query: z.string().trim().min(2).max(300),
    kind: z.enum(["people", "organizations", "any"]).catch("any"),
  }),
};

export type ToolName = keyof typeof inputs;

// ---------- shaping results ----------

/** Trims long free text so one bio can't crowd out the rest of a result. */
export function clip(text: string | null | undefined, max = 280): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const profileUrl = (id: string) => `/app/people/${id}`;
/** The staff request form with this person filled in (same link as Request Introduction on cards). */
const introRequestUrl = (id: string) => `/app/requests/new?person=${encodeURIComponent(id)}&intro=1`;

/**
 * "sewing background; offers practical skills": the reasons searchPeople()
 * gave, as one translated phrase (same grouping as <MatchReasons>).
 */
export function describeReasons(reasons: readonly MatchReason[] | undefined, locale: Locale = "en", max = 3): string | null {
  if (!reasons?.length) return null;
  const t = makeT(locale);
  const groups: { kind: MatchReason["kind"]; values: string[] }[] = [];
  for (const { kind, value } of reasons) {
    const group = groups.find((g) => g.kind === kind && kind !== "offers");
    if (group) group.values.push(value);
    else groups.push({ kind, values: [value] });
  }
  const topic = (tag: string) => (catalogCap(tag) ? capTopicShort(tag) : tag);
  return groups
    .slice(0, max)
    .map(({ kind, values }) =>
      kind === "offers"
        ? t(`resources.why.offers.${values[0]}` as MessageKey)
        : t(`resources.why.${kind}` as MessageKey, { value: (kind === "cap" ? values.map(topic) : values).join(", ") }),
    )
    .join("; ");
}

/** How a staff member reaches someone: contact them, or ask an admin for an introduction. */
function reach(p: Pick<PersonSummary, "id" | "contact_mode" | "email" | "phone">) {
  const direct = p.contact_mode === "direct" && Boolean(p.email || p.phone);
  return direct
    ? { contact: "direct" as const, email: p.email, phone: p.phone, next_step: "contact" as const }
    : {
        contact: "introduction" as const,
        email: p.email,
        phone: p.phone,
        next_step: "request_introduction" as const,
        request_introduction_url: introRequestUrl(p.id),
      };
}

function compactPerson(p: SearchHit, admin: boolean) {
  return {
    id: p.id,
    name: p.full_name,
    profile_url: profileUrl(p.id),
    title: p.title,
    organization: p.organization_name,
    ways_to_help: p.contribution_types,
    skills: p.skills.slice(0, 12),
    cap_topics: p.cap_topics.slice(0, 8),
    affiliations: p.affiliations,
    status: p.status,
    availability: clip(p.availability, 140),
    location: p.location,
    preferred_language: p.preferred_language,
    ...reach(p),
    why: describeReasons(p.reasons),
    matched: [...new Set(p.matched)],
    // CRM fields: admins only.
    ...(admin ? { in_staff_directory: p.directory_visible, categories: p.categories, source: p.source } : {}),
  };
}

function mini(p: MiniPerson) {
  return { id: p.id, name: p.full_name, title: p.title, organization: p.organization_name, affiliations: p.affiliations };
}

/**
 * "Rosa Delgado (Board member) knows Lucía Herrera, who knows Mei Lin", in the
 * given language. The first person is always board or staff.
 */
export function describePath(path: IntroPath, locale: Locale = "en"): string {
  const t = makeT(locale);
  const [first, ...rest] = path.chain;
  const inner = first.affiliations.find((a) => a === "board" || a === "staff");
  const a = inner ? `${first.full_name} (${t(`common.affiliation.${inner}`)})` : first.full_name;
  return rest.length === 1
    ? t("assistant.path.direct", { a, b: rest[0].full_name })
    : t("assistant.path.via", { a, b: rest[0].full_name, c: rest[1].full_name });
}

function compactPath(path: IntroPath) {
  return {
    degree: path.degree,
    summary: describePath(path, "en"),
    chain: path.chain.map(mini),
    links: path.edges.map((e) => ({ kind: e.kind, about: clip(e.note, 120) })),
  };
}

const json = (value: unknown) => JSON.stringify(value);

const reasonsOf = (hits: SearchHit[]): Record<string, MatchReason[]> =>
  Object.fromEntries(hits.filter((h) => h.reasons.length).map((h) => [h.id, h.reasons]));

const adminOnly = (): ToolOutcome => ({ content: "This tool is only available to admins.", isError: true, personIds: [] });

// ---------- executors ----------

type Executor<K extends ToolName> = (input: z.output<(typeof inputs)[K]>, ctx: ToolContext) => Promise<ToolOutcome>;

const executors: { [K in ToolName]: Executor<K> } = {
  async search_people(input, ctx) {
    const admin = isAdmin(ctx.user);
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
    const { people, total } = await searchPeople(
      {
        q: input.query,
        contributionTypes: input.contribution_types,
        affiliations: input.affiliations,
        capTopics: input.cap_topics,
        language: input.spanish_speaking ? "es" : undefined,
        limit,
      },
      ctx.user,
    );
    return {
      content: json({ total, shown: people.length, people: people.map((p) => compactPerson(p, admin)) }),
      isError: false,
      personIds: people.map((p) => p.id),
      reasons: reasonsOf(people),
    };
  },

  async get_person(input, ctx) {
    const person = await getPerson(input.person_id, ctx.user);
    if (!person) return { content: "No person with that id.", isError: true, personIds: [] };
    const admin = isAdmin(ctx.user);
    const [relationships, engagements, caps] = await Promise.all([
      getRelationships(person.id, ctx.user),
      getEngagements(person.id, ctx.user),
      getCapsForPerson(person.id),
    ]);
    return {
      content: json({
        id: person.id,
        name: person.full_name,
        profile_url: profileUrl(person.id),
        title: person.title,
        organization: person.organization_name,
        organization_kind: person.organization_kind,
        ways_to_help: person.contribution_types,
        skills: person.skills,
        cap_topics: person.cap_topics,
        affiliations: person.affiliations,
        status: person.status,
        availability: clip(person.availability, 200),
        location: person.location,
        preferred_language: person.preferred_language,
        ...reach(person),
        bio: clip(person.bio, 600),
        summary: clip(person.shared_summary, 400),
        // Private CRM fields: admins only.
        ...(admin
          ? {
              in_staff_directory: person.directory_visible,
              categories: person.categories,
              source: person.source,
              notes: clip(person.notes, 400),
              funding_focus: clip(person.funding_focus, 300),
              origin: clip(person.origin, 200),
              relationship_owner: person.owner_name,
            }
          : {}),
        knows: relationships.slice(0, 15).map((r) => ({
          kind: r.kind,
          direction: r.direction,
          about: clip(r.note, 120),
          person: mini(r.other),
        })),
        recent_history: engagements.slice(0, 5).map((e) => ({
          kind: e.kind,
          date: e.happened_on,
          by: e.user_name,
          cap: e.cap_title,
          what_happened: clip(e.notes, 160),
        })),
        caps: caps.map((c) => ({ id: c.id, title: c.title, status: c.status, partner_status: c.partner_status })),
      }),
      isError: false,
      personIds: [person.id, ...relationships.slice(0, 15).map((r) => r.other.id)],
    };
  },

  async find_intro_paths(input, ctx) {
    const person = await getPerson(input.person_id, ctx.user);
    if (!person) return { content: "No person with that id.", isError: true, personIds: [] };
    const paths = (await findIntroPaths(person.id, ctx.user)).slice(0, 8);
    const inner = person.affiliations.some((a) => a === "board" || a === "staff");
    return {
      content: json({
        person: { id: person.id, name: person.full_name },
        is_board_or_staff: inner,
        paths: paths.map(compactPath),
      }),
      isError: false,
      personIds: [person.id, ...paths.flatMap((p) => p.chain.map((c) => c.id))],
    };
  },

  async find_connectors_for_need(input, ctx) {
    const admin = isAdmin(ctx.user);
    const matches = await findConnectorsForNeed(
      {
        q: input.query,
        contributionTypes: input.contribution_types,
        limit: 10,
      },
      ctx.user,
    );
    return {
      content: json({
        matches: matches.map((m) => ({
          ...compactPerson(m.person, admin),
          board_or_staff: m.direct,
          intro_paths: m.paths.slice(0, 3).map(compactPath),
        })),
      }),
      isError: false,
      personIds: matches.flatMap((m) => [m.person.id, ...m.paths.slice(0, 3).flatMap((p) => p.chain.map((c) => c.id))]),
      reasons: reasonsOf(matches.map((m) => m.person)),
    };
  },

  async list_caps(input, ctx) {
    const status = (CAP_STATUSES as readonly string[]).includes(input.status ?? "") ? (input.status as CapStatus) : undefined;
    const all = input.mine
      ? await listMyCaps(ctx.user, { includeComplete: true })
      : await listCaps({ status }, ctx.user);
    const caps = all.filter((c) => !status || c.status === status).slice(0, 20);
    return {
      content: json({
        caps: caps.map((c) => ({
          id: c.id,
          title: c.title,
          url: `/app/caps/${c.id}`,
          challenge: clip(c.driving_question, 200),
          teacher: c.teacher ?? c.owner_name,
          blocks: c.blocks,
          labels: c.labels,
          impact: clip(c.impact, 200),
          topics: c.topics,
          needs: clip(c.needs, 240),
          term: c.term,
          status: c.status,
          partners: c.partner_count,
          confirmed: c.confirmed_count,
        })),
      }),
      isError: false,
      personIds: [],
    };
  },

  async list_follow_ups(input, ctx) {
    if (!isAdmin(ctx.user)) return adminOnly();
    if (input.person_id && !(await getPerson(input.person_id, ctx.user))) {
      return { content: "No person with that id.", isError: true, personIds: [] };
    }
    const items = await listFollowUps(ctx.user, {
      personId: input.person_id,
      views: input.include_completed ? [...FOLLOW_UP_VIEWS] : undefined,
      limit: 25,
    });
    return {
      content: json({
        follow_ups: items.map((f) => ({
          id: f.id,
          person: { id: f.person_id, name: f.person_name, organization: f.organization_name },
          action: clip(f.action, 200),
          due_on: f.due_on,
          view: f.view,
          status: f.status,
          awaiting_response: f.awaiting_response,
          owner: f.owner_name,
          opportunity: f.opportunity_title,
        })),
        url: "/app/follow-ups",
      }),
      isError: false,
      personIds: [...new Set(items.map((f) => f.person_id))],
    };
  },

  async list_opportunities(input, ctx) {
    if (!isAdmin(ctx.user)) return adminOnly();
    if (input.person_id && !(await getPerson(input.person_id, ctx.user))) {
      return { content: "No person with that id.", isError: true, personIds: [] };
    }
    const items = await listOpportunities(ctx.user, {
      personId: input.person_id,
      state: input.state ?? "open",
      track: input.track,
      limit: 25,
    });
    return {
      content: json({
        opportunities: items.map((o) => ({
          id: o.id,
          url: `/app/opportunities/${o.id}`,
          title: o.title,
          person: o.person_id ? { id: o.person_id, name: o.person_name } : null,
          organization: o.organization_name,
          track: o.track,
          kind: o.kind,
          stage: o.stage,
          amount: o.amount,
          target_date: o.target_date,
          cap: o.cap_title,
          owner: o.owner_name,
          open_follow_ups: o.open_follow_ups,
          next_follow_up_on: o.next_follow_up_on,
          notes: clip(o.notes, 200),
        })),
      }),
      isError: false,
      personIds: [...new Set(items.flatMap((o) => (o.person_id ? [o.person_id] : [])))],
    };
  },

  async search_web(input, ctx) {
    if (!isAdmin(ctx.user)) return { content: "Web search is only available to admins.", isError: true, personIds: [] };
    if (!isWebSearchConfigured()) return { content: "Web search is not set up (no EXA_API_KEY).", isError: true, personIds: [] };
    const category = input.kind === "people" ? "people" : input.kind === "organizations" ? "company" : undefined;
    try {
      // Exa's people index matches best when asked for profiles explicitly.
      const query = category === "people" && !/profiles?/i.test(input.query) ? `professional profiles of ${input.query}` : input.query;
      const results = await exaSearch({ query, category, numResults: WEB_RESULTS });
      return {
        content: json({
          note: "Unverified web results, not NVA contacts. Present them separately, with the page address in plain text. To save one, use Search beyond our network on /app/connections.",
          results: results.map((r) => ({
            title: r.title,
            url: r.url,
            author: r.author,
            published: r.publishedDate,
            excerpt: clip(r.highlights.join(" "), 500),
          })),
        }),
        isError: false,
        personIds: [],
      };
    } catch (error) {
      const status = error instanceof ExaError ? error.status : null;
      return {
        content: status === 429 || status === 402 ? "Web search is busy or out of credit right now." : "Web search failed. Answer from the database only.",
        isError: true,
        personIds: [],
      };
    }
  },
};

/**
 * Validates and runs one tool call for this viewer. Never throws: failures
 * become is_error results the model can recover from. A tool the viewer's
 * role doesn't get is reported as unknown, exactly like a made-up name.
 */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!(name in inputs) || !canUseTool(ctx.user, name)) return { content: `Unknown tool: ${name}`, isError: true, personIds: [] };
  const toolName = name as ToolName;
  const parsed = inputs[toolName].safeParse(rawInput ?? {});
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { content: `Invalid input. ${problems}`, isError: true, personIds: [] };
  }
  try {
    const run = executors[toolName] as Executor<ToolName>;
    return await run(parsed.data as never, ctx);
  } catch {
    return { content: "The database lookup failed. Try again or try a different search.", isError: true, personIds: [] };
  }
}

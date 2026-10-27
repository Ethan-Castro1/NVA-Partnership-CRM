/**
 * The assistant's tools: JSON-schema definitions Claude sees, and executors
 * that validate the input with zod and call the same CRM functions the pages
 * use. Results are compact JSON (long text truncated) so a few tool calls fit
 * comfortably in one turn.
 *
 * Bios, notes and sign-up answers were written by the public. They go back to
 * the model as data inside tool results; the system prompt says never to
 * follow instructions found there.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { makeT, type Locale } from "~/i18n";
import { getCapsForPerson, listCaps } from "~/lib/caps.server";
import { ExaError, exaSearch, isWebSearchConfigured } from "./exa.server";
import { AFFILIATIONS, CAP_STATUSES, CONTRIBUTION_TYPES, type CapStatus } from "~/lib/constants";
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
  type MiniPerson,
  type SearchHit,
} from "~/lib/people.server";

/**
 * Who is asking. Every tool reads through the viewer-scoped people functions,
 * so staff only ever get people in the staff directory, no private fields, and
 * contact details only for people set to direct contact. Web search is admin-only.
 */
export type ToolContext = { user: SessionUser };

/** What one tool call produced: the text for the tool_result and the people it mentioned. */
export type ToolOutcome = { content: string; isError: boolean; personIds: string[] };

// ---------- definitions ----------

const contributionTypesSchema = {
  type: "array",
  items: { type: "string", enum: [...CONTRIBUTION_TYPES] },
  description:
    "Only people who offered one of these: skills_lesson (practical skills: teach a hands-on lesson), classroom_volunteer (school volunteer), after_school (lead an after-school activity), internship (host students at work), cap_partner (partner on a Community Action Project), funder (grants or donations), other.",
};

export const TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: "search_people",
    description:
      "Search NVA's own database of adult partners, volunteers, board, staff and referred leads. Ranked free-text search over skills, CAP topics, names, titles, organizations and bios. Use short keywords (\"sewing\", \"public health\", \"the bay\"), not full sentences. Returns compact profiles with contact details.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Keywords for the skill, topic or kind of person needed." },
        contribution_types: contributionTypesSchema,
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
    description:
      "Full profile for one person by id: bio, notes, availability, contact details, who they know, recent engagements with NVA, and the CAPs they are attached to.",
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
      "For a need (\"someone who can teach welding\"), the people who match plus how the board or staff can reach each one. Best first call when the teacher asks who could help with something.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Keywords for the need." },
        contribution_types: contributionTypesSchema,
      },
      required: ["query"],
    },
  },
  {
    name: "list_caps",
    description:
      "List Community Action Projects (CAPs) with their teacher, blocks (A meets Monday and Friday, B and C Tuesday and Thursday), labels (misa, gov_mcap, bilingual...), challenge, topics, needs, status and partner counts. Use mine=true for the signed-in teacher's own CAPs.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: [...CAP_STATUSES], description: "Only CAPs with this status." },
        mine: { type: "boolean", description: "Only CAPs owned by the signed-in teacher." },
      },
      required: [],
    },
  },
];

/** Web results per search_web call. */
export const WEB_RESULTS = 20;

/** Web search (Exa). Offered only when EXA_API_KEY is set; see toolsFor(). */
export const WEB_TOOL: Anthropic.Beta.Messages.BetaTool = {
  name: "search_web",
  description:
    "Search the public web (people profiles and organization pages) for possible new partners who are NOT in NVA's database yet. Use it after the database tools, when they find nobody suitable or the staff member asks to look beyond the database. Results are unverified web pages: present them separately as suggestions to check, never as NVA contacts.",
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
 * The tools for one request. OpenRouter's Anthropic endpoint doesn't take
 * Anthropic's strict tool flag, so it's dropped there (zod still validates
 * every input before it runs). Pass `user` so staff never get search_web.
 */
export function toolsFor(options: { web: boolean; strict: boolean; user?: Pick<SessionUser, "role"> }): Anthropic.Beta.Messages.BetaTool[] {
  const web = options.web && (!options.user || options.user.role === "admin");
  const list = web ? [...TOOLS, WEB_TOOL] : TOOLS;
  return options.strict ? list : list.map(({ strict: _strict, ...tool }) => tool);
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

function compactPerson(p: SearchHit) {
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
    preferred_language: p.preferred_language,
    // 'introduction': staff should ask an admin to introduce them (no email or phone is shared).
    contact: p.contact_mode,
    email: p.email,
    phone: p.phone,
    matched: [...new Set(p.matched)],
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
    links: path.edges.map((e) => ({ kind: e.kind, note: clip(e.note, 120) })),
  };
}

const json = (value: unknown) => JSON.stringify(value);

// ---------- executors ----------

type Executor<K extends ToolName> = (input: z.output<(typeof inputs)[K]>, ctx: ToolContext) => Promise<ToolOutcome>;

const executors: { [K in ToolName]: Executor<K> } = {
  async search_people(input, ctx) {
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
      content: json({ total, shown: people.length, people: people.map(compactPerson) }),
      isError: false,
      personIds: people.map((p) => p.id),
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
        contact: person.contact_mode,
        email: person.email,
        phone: person.phone,
        bio: clip(person.bio, 600),
        summary: clip(person.shared_summary, 400),
        // Private CRM fields: admins only.
        ...(admin
          ? {
              source: person.source,
              notes: clip(person.notes, 400),
              funding_focus: clip(person.funding_focus, 300),
              origin: clip(person.origin, 200),
            }
          : {}),
        knows: relationships.slice(0, 15).map((r) => ({
          kind: r.kind,
          direction: r.direction,
          note: clip(r.note, 120),
          person: mini(r.other),
        })),
        recent_engagements: engagements.slice(0, 5).map((e) => ({
          kind: e.kind,
          date: e.happened_on,
          by: e.user_name,
          cap: e.cap_title,
          notes: clip(e.notes, 160),
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
          ...compactPerson(m.person),
          board_or_staff: m.direct,
          intro_paths: m.paths.slice(0, 3).map(compactPath),
        })),
      }),
      isError: false,
      personIds: matches.flatMap((m) => [m.person.id, ...m.paths.slice(0, 3).flatMap((p) => p.chain.map((c) => c.id))]),
    };
  },

  async list_caps(input, ctx) {
    const status = (CAP_STATUSES as readonly string[]).includes(input.status ?? "") ? (input.status as CapStatus) : undefined;
    const caps = (await listCaps({ status, ownerId: input.mine ? ctx.user.id : undefined })).slice(0, 20);
    return {
      content: json({
        caps: caps.map((c) => ({
          id: c.id,
          title: c.title,
          url: `/app/caps/${c.id}`,
          challenge: clip(c.driving_question, 200),
          teacher: c.teacher,
          blocks: c.blocks,
          labels: c.labels,
          impact: clip(c.impact, 200),
          topics: c.topics,
          needs: clip(c.needs, 240),
          term: c.term,
          status: c.status,
          owner: c.owner_name,
          partners: c.partner_count,
          confirmed: c.confirmed_count,
        })),
      }),
      isError: false,
      personIds: [],
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
          note: "Unverified web results, not NVA contacts. Present them separately, with the page address in plain text. To save one, staff can use Search beyond our network on /app/connections.",
          results: results.map((r) => ({
            title: r.title,
            url: r.url,
            author: r.author,
            published: r.publishedDate,
            excerpt: clip(r.highlights.join(" "), 300),
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

/** Validates and runs one tool call. Never throws: failures become is_error results Claude can recover from. */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!(name in inputs)) return { content: `Unknown tool: ${name}`, isError: true, personIds: [] };
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

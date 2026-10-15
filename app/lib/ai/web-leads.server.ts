/**
 * "Search beyond our network": Claude searches the web for people and
 * organizations around Annapolis who could help with a need, and records them
 * as leads with the pages it found them on. Leads stay in web_leads (never in
 * people, never with relationships) until a staff member reviews one and
 * saves it as a contact, because nothing from the web is verified.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { makeT, type Locale } from "~/i18n";
import { INNER_CIRCLE } from "../constants";
import { newId, query, queryOne, transaction } from "../db.server";
import { createPerson, getPerson } from "../people.server";
import { AI_MODEL, WEB_SEARCH_TOOL, getAnthropic, isAiConfigured } from "./client.server";

export const MAX_LEADS = 6;
const MAX_URLS_PER_LEAD = 5;

// ---------- the record_leads tool ----------

export const RECORD_LEADS_TOOL: Anthropic.Tool = {
  name: "record_leads",
  description:
    "Record the people you found, once, at the end of your research. Include only adults in public professional " +
    "roles, each with the URLs of search results that mention them. Call this exactly once, even with an empty list.",
  input_schema: {
    type: "object",
    properties: {
      leads: {
        type: "array",
        maxItems: MAX_LEADS,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The person's name as published, or the organization's name if no person is named." },
            organization: { type: "string", description: "Their organization, or empty." },
            role_title: { type: "string", description: "Their public professional role, or empty." },
            summary: { type: "string", description: "One or two sentences on who they are, from the sources." },
            why_relevant: { type: "string", description: "Why they could help with this need." },
            source_urls: {
              type: "array",
              items: { type: "string" },
              description: "URLs of web search results (from this conversation) that mention them.",
            },
            via_note: {
              type: "string",
              description: "How the named NVA connector might be linked to them (shared employer, board, field), or empty.",
            },
          },
          required: ["name", "summary", "why_relevant", "source_urls"],
        },
      },
    },
    required: ["leads"],
  },
};

export type WebLeadDraft = {
  name: string;
  organization: string | null;
  role_title: string | null;
  summary: string | null;
  why_relevant: string | null;
  source_urls: string[];
  via_note: string | null;
};

const text = (max: number) =>
  z
    .unknown()
    .transform((v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : ""))
    .optional();

const leadSchema = z.object({
  name: text(120),
  organization: text(160),
  role_title: text(160),
  summary: text(600),
  why_relevant: text(600),
  via_note: text(300),
  source_urls: z.unknown().optional(),
});

// Phone-number-looking runs: leads are about public roles, so drop any that slip in.
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const scrub = (value: string | undefined) => {
  const clean = (value ?? "").replace(PHONE, "").replace(/\s{2,}/g, " ").trim();
  return clean || null;
};

/** A comparable form of a URL: lowercase host, no fragment, no trailing slash. */
export function urlKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return null;
  }
}

/** Keeps http(s) URLs only (no credentials, sensible length), deduped. */
export function cleanSourceUrls(input: unknown, seen?: Set<string>): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Map<string, string>();
  for (const raw of input) {
    if (typeof raw !== "string" || raw.length > 500) continue;
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      continue;
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) continue;
    const key = urlKey(url.href);
    if (!key || out.has(key)) continue;
    // When we know what the search returned, a source must be one of those pages.
    if (seen && seen.size && !seen.has(key)) continue;
    url.hash = "";
    out.set(key, url.href);
    if (out.size >= MAX_URLS_PER_LEAD) break;
  }
  return [...out.values()];
}

/**
 * Validates record_leads input from the model: trims and caps every field,
 * keeps only checkable sources, drops leads with no name or no source, dedupes
 * by name and stops at MAX_LEADS.
 */
export function parseRecordLeads(input: unknown, seen?: Set<string>): WebLeadDraft[] {
  const leads = (input as { leads?: unknown } | null)?.leads;
  if (!Array.isArray(leads)) return [];
  const out: WebLeadDraft[] = [];
  const names = new Set<string>();
  for (const raw of leads) {
    const parsed = leadSchema.safeParse(raw);
    if (!parsed.success) continue;
    const lead = parsed.data;
    const name = scrub(lead.name);
    if (!name || names.has(name.toLowerCase())) continue;
    const source_urls = cleanSourceUrls(lead.source_urls, seen);
    if (!source_urls.length) continue;
    names.add(name.toLowerCase());
    out.push({
      name,
      organization: scrub(lead.organization),
      role_title: scrub(lead.role_title),
      summary: scrub(lead.summary),
      why_relevant: scrub(lead.why_relevant),
      source_urls,
      via_note: scrub(lead.via_note),
    });
    if (out.length >= MAX_LEADS) break;
  }
  return out;
}

/** Every page URL the web search returned or Claude cited, as urlKey()s. */
export function collectSearchUrls(blocks: unknown[]): Set<string> {
  const seen = new Set<string>();
  const add = (url: unknown) => {
    const key = typeof url === "string" ? urlKey(url) : null;
    if (key) seen.add(key);
  };
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; content?: unknown; citations?: unknown };
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const result of b.content) add((result as { url?: unknown })?.url);
    }
    if (Array.isArray(b.citations)) {
      for (const citation of b.citations) add((citation as { url?: unknown })?.url);
    }
  }
  return seen;
}

// ---------- rate limit (per user, in memory) ----------

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const searches = new Map<string, number[]>();

/** Records a search for `userId` and says whether it's allowed (10 per rolling hour). */
export function takeSearchSlot(userId: string, now = Date.now()): boolean {
  const recent = (searches.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    searches.set(userId, recent);
    return false;
  }
  recent.push(now);
  searches.set(userId, recent);
  return true;
}

// ---------- the search ----------

export type WebSearchError =
  | "connections.web.error.notConfigured"
  | "connections.web.error.rateLimited"
  | "connections.web.error.busy"
  | "connections.web.error.auth"
  | "connections.web.error.failed"
  | "connections.web.error.viaInvalid";

export type WebSearchResult = { ok: true; count: number } | { ok: false; error: WebSearchError };

function systemPrompt(locale: Locale): string {
  return [
    "You help New Village Academy (NVA), a small public charter high school in Annapolis, Maryland, find community partners.",
    "Community members teach practical skills lessons, volunteer in classes, host internships and partner on student Community Action Projects (CAPs).",
    "Use web search to find real people or organizations in Annapolis or Anne Arundel County, Maryland (nearby Maryland only if there is nothing local) who could help with the need.",
    "Rules:",
    "- Only adults in public professional or civic roles, and organizations. Never students, minors or private individuals.",
    "- Never include home addresses, personal phone numbers or personal email addresses.",
    "- Every lead must come from the search results: list the result URLs that mention them. Do not guess.",
    "- Prefer people whose public role fits the need (an organization's education or outreach staff, small business owners, public officials, nonprofit leaders).",
    `- Write summary, why_relevant and via_note in ${locale === "es" ? "Spanish (Latin American, plain and warm)" : "English (plain and warm)"}.`,
    `When you are done researching, finish by calling record_leads exactly once with up to ${MAX_LEADS} leads (an empty list if you found none). Do not write a final answer in text.`,
  ].join("\n");
}

async function viaDescription(viaId: string | null | undefined): Promise<{ id: string; text: string } | null | "invalid"> {
  if (!viaId) return null;
  const person = await getPerson(viaId);
  if (!person || !person.affiliations.some((a) => INNER_CIRCLE.includes(a))) return "invalid";
  const details = [person.title, person.organization_name].filter(Boolean).join(", ");
  const tags = [...person.skills, ...person.cap_topics].slice(0, 8).join(", ");
  return {
    id: person.id,
    text: `${person.full_name}${details ? ` (${details})` : ""}, NVA ${person.affiliations.join("/")}${tags ? `; interests: ${tags}` : ""}`,
  };
}

/**
 * Runs one web search for `need`, saves what it finds as 'suggested' web leads
 * and returns how many. Errors come back as i18n keys, never thrown.
 */
export async function findWebLeads(input: {
  need: string;
  via?: string | null;
  locale: Locale;
  userId: string;
}): Promise<WebSearchResult> {
  if (!isAiConfigured()) return { ok: false, error: "connections.web.error.notConfigured" };
  const via = await viaDescription(input.via);
  if (via === "invalid") return { ok: false, error: "connections.web.error.viaInvalid" };
  if (!takeSearchSlot(input.userId)) return { ok: false, error: "connections.web.error.rateLimited" };

  const need = input.need.trim().slice(0, 300);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Need: ${need}\n` +
        (via
          ? `NVA connector who might make an introduction: ${via.text}. For each lead, say in via_note how this person might be linked (same employer, board, field or neighborhood), or leave it empty.`
          : "No particular NVA connector; leave via_note empty."),
    },
  ];

  let leadsInput: unknown = null;
  const seen = new Set<string>();
  try {
    const client = getAnthropic();
    let nudged = false;
    for (let turn = 0; turn < 6; turn++) {
      const response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: systemPrompt(input.locale),
        tools: [WEB_SEARCH_TOOL, RECORD_LEADS_TOOL],
        messages,
      });
      for (const url of collectSearchUrls(response.content)) seen.add(url);

      const call = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "record_leads",
      );
      if (call) {
        // We have what we need; the short tool_result would only close the loop, so stop here.
        leadsInput = call.input;
        break;
      }
      if (response.stop_reason === "pause_turn") {
        // The server paused a long search: send its work back so it can continue.
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      if (response.stop_reason === "end_turn" && !nudged) {
        nudged = true;
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: "Please call record_leads now with what you found." });
        continue;
      }
      break;
    }
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      if (error.status === 401 || error.status === 403) return { ok: false, error: "connections.web.error.auth" };
      if (error.status === 429 || error.status === 529 || (error.status ?? 0) >= 500)
        return { ok: false, error: "connections.web.error.busy" };
    }
    console.error("web lead search failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false, error: "connections.web.error.failed" };
  }

  if (leadsInput === null) return { ok: false, error: "connections.web.error.failed" };
  const leads = parseRecordLeads(leadsInput, seen);
  await saveWebLeads(leads, { query: need, viaPersonId: via?.id ?? null, userId: input.userId });
  return { ok: true, count: leads.length };
}

// ---------- stored leads ----------

export type WebLeadView = {
  id: string;
  query: string;
  name: string;
  organization: string | null;
  role_title: string | null;
  summary: string | null;
  why_relevant: string | null;
  source_urls: string[];
  via_person_id: string | null;
  via_person_name: string | null;
  via_note: string | null;
  status: "suggested" | "saved" | "dismissed";
  saved_person_id: string | null;
  created_at: string;
};

export async function saveWebLeads(
  leads: WebLeadDraft[],
  meta: { query: string; viaPersonId: string | null; userId: string | null },
): Promise<void> {
  if (!leads.length) return;
  await transaction(async (tx) => {
    for (const lead of leads) {
      await tx.query(
        `INSERT INTO web_leads (id, query, name, organization, role_title, summary, why_relevant, source_urls,
                                via_person_id, via_note, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'suggested',$11)`,
        [
          newId(), meta.query, lead.name, lead.organization, lead.role_title, lead.summary, lead.why_relevant,
          JSON.stringify(lead.source_urls), meta.viaPersonId, meta.viaPersonId ? lead.via_note : null, meta.userId,
        ],
      );
    }
  });
}

/** Suggested leads and recently saved ones (so the "open profile" link stays), newest first. */
export async function listWebLeads(limit = 30): Promise<WebLeadView[]> {
  const rows = await query<WebLeadView & { source_urls: unknown }>(
    `SELECT w.id, w.query, w.name, w.organization, w.role_title, w.summary, w.why_relevant, w.source_urls,
            w.via_person_id, v.full_name AS via_person_name, w.via_note, w.status, w.saved_person_id, w.created_at
       FROM web_leads w LEFT JOIN people v ON v.id = w.via_person_id
      WHERE w.status = 'suggested' OR (w.status = 'saved' AND w.created_at > now() - interval '30 days')
      ORDER BY w.created_at DESC
      LIMIT $1`,
    [limit],
  );
  // Re-check on the way out too: only http(s) links ever reach an href.
  return rows.map((row) => ({ ...row, source_urls: cleanSourceUrls(row.source_urls) }));
}

/**
 * Turns a suggested lead into a 'lead' person (source 'web') with the summary
 * and sources in their notes. No relationship is created: it's unverified.
 * Returns the new person's id, or null if the lead was already handled.
 */
export async function saveWebLeadAsContact(leadId: string, userId: string, locale: Locale): Promise<string | null> {
  const lead = await queryOne<WebLeadView & { source_urls: unknown }>(
    `SELECT w.*, v.full_name AS via_person_name FROM web_leads w LEFT JOIN people v ON v.id = w.via_person_id
      WHERE w.id = $1 AND w.status = 'suggested'`,
    [leadId],
  );
  if (!lead) return null;
  const t = makeT(locale);
  const urls = cleanSourceUrls(lead.source_urls);
  const notes = [
    t("connections.leads.notesHeader", { q: lead.query }),
    lead.summary,
    lead.why_relevant ? `${t("connections.leads.whyRelevant")}: ${lead.why_relevant}` : null,
    lead.via_person_name && lead.via_note
      ? t("connections.leads.notesVia", { name: lead.via_person_name, note: lead.via_note })
      : null,
    urls.length ? `${t("connections.leads.sources")}:\n${urls.map((u) => `- ${u}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return transaction(async (tx) => {
    // Claim the lead first so two clicks can't create two people.
    const claimed = await tx.query<{ id: string }>(
      "UPDATE web_leads SET status = 'saved' WHERE id = $1 AND status = 'suggested' RETURNING id",
      [leadId],
    );
    if (!claimed.length) return null;
    const personId = await createPerson(
      {
        full_name: lead.name,
        organization_name: lead.organization,
        title: lead.role_title,
        status: "lead",
        source: "web",
        notes,
      },
      userId,
      tx,
    );
    await tx.query("UPDATE web_leads SET saved_person_id = $2 WHERE id = $1", [leadId, personId]);
    return personId;
  });
}

export async function dismissWebLead(leadId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "UPDATE web_leads SET status = 'dismissed' WHERE id = $1 AND status = 'suggested' RETURNING id",
    [leadId],
  );
  return rows.length > 0;
}


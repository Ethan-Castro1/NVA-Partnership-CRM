import { describe, expect, it, vi } from "vitest";
import { query } from "../db.server";
import { createPerson, getPerson } from "../people.server";
import {
  MAX_LEADS,
  cleanSourceUrls,
  buildLeadQueries,
  leadsFromResults,
  splitProfileTitle,
  dismissWebLead,
  findWebLeads,
  listWebLeads,
  parseRecordLeads,
  saveWebLeadAsContact,
  saveWebLeads,
  takeSearchSlot,
  urlKey,
} from "./web-leads.server";

describe("source URLs", () => {
  it("keeps only http(s) links without credentials, deduped", () => {
    expect(
      cleanSourceUrls([
        "https://www.example.org/team#staff",
        "https://example.org/team/",
        "javascript:alert(1)",
        "ftp://example.org/file",
        "https://user:pw@example.org/",
        "not a url",
        42,
        "http://annapolis.gov/news?id=3",
      ]),
    ).toEqual(["https://www.example.org/team", "http://annapolis.gov/news?id=3"]);
    expect(cleanSourceUrls("https://example.org")).toEqual([]);
  });

  it("only keeps pages the search actually returned, when we know them", () => {
    const seen = new Set(["example.org/a", "news.com/story"]);
    expect(cleanSourceUrls(["https://example.org/a/", "https://news.com/story", "https://made-up.org/"], seen)).toEqual([
      "https://example.org/a/",
      "https://news.com/story",
    ]);
    expect(urlKey("mailto:a@b.c")).toBeNull();
  });
});

describe("parseRecordLeads", () => {
  it("validates, trims, caps lengths and drops unsourced or nameless leads", () => {
    const leads = parseRecordLeads({
      leads: [
        {
          name: "  Dana   Reyes ",
          organization: "Chesapeake Bay Foundation",
          role_title: "Education Manager",
          summary: "Leads field programs. Call 410-555-0134 for info.",
          why_relevant: "x".repeat(900),
          source_urls: ["https://cbf.org/staff", "javascript:void(0)"],
          via_note: 7,
        },
        { name: "No Sources", summary: "s", why_relevant: "w", source_urls: [] },
        { name: "", summary: "s", why_relevant: "w", source_urls: ["https://a.org"] },
        { name: "dana reyes", source_urls: ["https://dup.org"] },
        "garbage",
      ],
    });
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      name: "Dana Reyes",
      organization: "Chesapeake Bay Foundation",
      role_title: "Education Manager",
      source_urls: ["https://cbf.org/staff"],
      via_note: null,
    });
    expect(leads[0].summary).not.toMatch(/555/);
    expect(leads[0].why_relevant).toHaveLength(600);
  });

  it("returns at most MAX_LEADS and survives bad input", () => {
    const many = Array.from({ length: MAX_LEADS + 5 }, (_, i) => ({ name: `P${i}`, source_urls: [`https://e.org/${i}`] }));
    expect(parseRecordLeads({ leads: many })).toHaveLength(MAX_LEADS);
    expect(parseRecordLeads(null)).toEqual([]);
    expect(parseRecordLeads({ leads: "nope" })).toEqual([]);
  });
});

describe("rate limit", () => {
  it("allows 10 searches per user per rolling hour", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(takeSearchSlot("u1", now + i)).toBe(true);
    expect(takeSearchSlot("u1", now + 11)).toBe(false);
    expect(takeSearchSlot("u2", now + 11)).toBe(true);
    expect(takeSearchSlot("u1", now + 60 * 60 * 1000 + 1)).toBe(true);
  });
});

describe("stored leads", () => {
  it("says AI isn't configured without an API key", async () => {
    expect(await findWebLeads({ need: "welding", locale: "en", userId: "u", role: "admin" })).toEqual({
      ok: false,
      error: "connections.web.error.notConfigured",
    });
  });

  it("saves a lead as a 'lead' contact once, with notes and no relationships", async () => {
    const via = await createPerson({ full_name: "Bea Board", affiliations: ["board"] }, null);
    await saveWebLeads(
      parseRecordLeads({
        leads: [
          { name: "Sam Shore", organization: "Bay Lab", role_title: "Scientist", summary: "Studies oysters.", why_relevant: "Water testing.", source_urls: ["https://baylab.org/sam"], via_note: "Same board" },
          { name: "Other Person", summary: "s", why_relevant: "w", source_urls: ["https://o.org"] },
        ],
      }),
      { query: "water testing", viaPersonId: via, userId: null },
    );
    const leads = await listWebLeads();
    expect(leads.map((l) => l.name).sort()).toEqual(["Other Person", "Sam Shore"]);
    const sam = leads.find((l) => l.name === "Sam Shore")!;
    expect(sam).toMatchObject({ via_person_name: "Bea Board", via_note: "Same board", source_urls: ["https://baylab.org/sam"] });

    const personId = await saveWebLeadAsContact(sam.id, null as unknown as string, "en");
    expect(personId).toBeTruthy();
    expect(await saveWebLeadAsContact(sam.id, null as unknown as string, "en")).toBeNull();
    const person = await getPerson(personId!, { id: "test-admin", role: "admin" });
    expect(person).toMatchObject({ full_name: "Sam Shore", status: "lead", source: "web", title: "Scientist", organization_name: "Bay Lab" });
    expect(person!.notes).toContain("https://baylab.org/sam");
    expect(person!.notes).toContain("water testing");
    expect(await query("SELECT 1 FROM relationships")).toHaveLength(0);

    const other = leads.find((l) => l.name === "Other Person")!;
    expect(await dismissWebLead(other.id)).toBe(true);
    expect(await dismissWebLead(other.id)).toBe(false);
    const after = await listWebLeads();
    expect(after.map((l) => [l.name, l.status, l.saved_person_id])).toEqual([["Sam Shore", "saved", personId]]);
  });
});

describe("Exa lead search pieces", () => {
  it("searches people and organizations, and the connector's workplace when one is chosen", () => {
    expect(buildLeadQueries("marine biologist", null).map((q) => q.category)).toEqual(["people", "company"]);
    const withVia = buildLeadQueries("marine biologist", "US Department of Agriculture");
    expect(withVia).toHaveLength(3);
    expect(withVia[2]).toMatchObject({ category: "people" });
    expect(withVia[2].query).toContain("US Department of Agriculture");
  });

  it("reads names, roles and organizations from profile titles", () => {
    expect(splitProfileTitle("Jane Doe - Outreach Director - Severn Riverkeeper | LinkedIn")).toEqual({
      name: "Jane Doe",
      role: "Outreach Director",
      organization: "Severn Riverkeeper",
    });
    expect(splitProfileTitle("Annapolis Maritime Museum")).toEqual({ name: "Annapolis Maritime Museum", role: null, organization: null });
  });

  it("turns raw results into sourced leads without Claude", () => {
    const leads = leadsFromResults(
      [
        { title: "Jane Doe - Educator - Bay Center | LinkedIn", url: "https://linkedin.com/in/jane", author: null, publishedDate: null, highlights: ["Runs field trips."], category: "people" },
        { title: "Bay Center", url: "https://baycenter.org", author: null, publishedDate: null, highlights: [], category: "company" },
        { title: "Bad link", url: "javascript:alert(1)", author: null, publishedDate: null, highlights: [], category: "company" },
      ],
      "Matches your search",
    );
    expect(leads.map((l) => [l.name, l.role_title, l.organization])).toEqual([
      ["Jane Doe", "Educator", "Bay Center"],
      ["Bay Center", null, null],
    ]);
    expect(leads[0].source_urls).toEqual(["https://linkedin.com/in/jane"]);
  });
});

describe("the Exa searches behind web leads", () => {
  it("uses deep search for people and auto for organizations, with highlights", async () => {
    const { createUser } = await import("~/lib/auth.server");
    const userId = await createUser({ email: "exa-types@nva.test", name: "Exa Types", role: "admin" });
    vi.stubEnv("EXA_API_KEY", "test");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return Response.json({ results: [] });
      }),
    );
    try {
      expect(await findWebLeads({ need: "oyster restoration", locale: "en", userId, role: "admin" })).toEqual({ ok: true, count: 0 });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
    expect(bodies.map((b) => [b.category, b.type])).toEqual([
      ["people", "deep"],
      ["company", "auto"],
    ]);
    expect(bodies[0]).toMatchObject({ numResults: 20, contents: { highlights: true } });
  });
});

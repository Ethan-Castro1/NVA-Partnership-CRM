import { describe, expect, it } from "vitest";
import { query } from "../db.server";
import { createPerson, getPerson } from "../people.server";
import {
  MAX_LEADS,
  cleanSourceUrls,
  collectSearchUrls,
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
    const seen = collectSearchUrls([
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://example.org/a" }] },
      { type: "text", text: "...", citations: [{ type: "web_search_result_location", url: "https://www.news.com/story/" }] },
      { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
      null,
    ]);
    expect([...seen].sort()).toEqual(["example.org/a", "news.com/story"]);
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
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `P${i}`, source_urls: [`https://e.org/${i}`] }));
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
    expect(await findWebLeads({ need: "welding", locale: "en", userId: "u" })).toEqual({
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
    const person = await getPerson(personId!);
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

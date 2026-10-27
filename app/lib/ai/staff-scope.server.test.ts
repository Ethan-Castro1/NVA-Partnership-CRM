/**
 * U7: what the assistant, the MCP connector and the CAP partner actions give
 * staff. Staff tool calls never return hidden people or private CRM fields,
 * staff have no web search or CRM tools, a connector key acts with its owner's
 * current role, and staff can't add, update or remove CAP partners.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_ACCOUNTS, createUser, demoLogin } from "~/lib/auth.server";
import { addCapPartner, createCap, getCap, getCapPartners, listCaps, listMyCaps, normalizeTeacherName } from "~/lib/caps.server";
import { query } from "~/lib/db.server";
import { createFollowUp } from "~/lib/follow-ups.server";
import { createMcpKey, userForMcpKey } from "~/lib/mcp-keys.server";
import { createOpportunity } from "~/lib/opportunities.server";
import { addRelationship, createPerson } from "~/lib/people.server";
import type { SessionUser } from "~/lib/types";
import { ADMIN_SYSTEM_PROMPT, fallbackAnswer, peopleForCards, runAssistant, STAFF_SYSTEM_PROMPT, systemPromptFor } from "./assistant.server";
import { handleMcpRequest, STAFF_MCP_INSTRUCTIONS } from "./mcp.server";
import { canUseTool, executeTool, STAFF_TOOLS, toolsFor } from "./tools.server";

let admin: SessionUser, staff: SessionUser;
let adminCookie: string, staffCookie: string;
let board: string, luis: string, sue: string, dana: string, hiddenMid: string, tia: string, capId: string;

/** Text that must never reach staff: hidden people and private CRM values. */
const SECRETS = [
  "Dana Whitfield",
  "Hidden Middle",
  "Launchpad",
  "zebra",
  "Private funding focus",
  "Met at a private dinner",
  "Chesapeake Youth Futures",
  "Grant for the maker space",
  "Send the budget",
];
/** Keys that only admins get in tool output. */
const PRIVATE_KEYS = ["notes", "funding_focus", "origin", "relationship_owner", "owner_user_id", "in_staff_directory", "source", "categories", "follow_ups", "opportunities"];

/** Every key that holds a value (null and empty values don't count). */
function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) out.add(k);
      keysDeep(v, out);
    }
  return out;
}

/** `asked` is the staff member's own words, which an answer may quote back. */
function expectStaffSafe(raw: string, { asked = "", keys: privateKeys = PRIVATE_KEYS }: { asked?: string; keys?: string[] } = {}) {
  const text = asked ? raw.split(asked).join("") : raw;
  for (const secret of SECRETS) expect(text, `leaked "${secret}"`).not.toContain(secret);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return;
  }
  const keys = keysDeep(body);
  for (const key of privateKeys) expect(keys.has(key), `returned "${key}"`).toBe(false);
}

const visible = { status: "active" as const, directory_visible: true };
const req = (path: string, cookie: string, body?: FormData) =>
  new Request(`http://localhost${path}`, { method: body ? "POST" : "GET", headers: { Cookie: cookie }, body });
const args = (request: Request, params: Record<string, string> = {}) => ({ request, params, context: {} }) as never;
const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
};
async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    const value = await promise;
    return value instanceof Response ? value.status : 200;
  } catch (error) {
    if (error instanceof Response) return error.status;
    throw error;
  }
}

beforeAll(async () => {
  vi.stubEnv("DEMO_LOGIN", "true");
  const adminId = await createUser({ email: DEMO_ACCOUNTS.admin, name: "Ashley Owner", password: "long-enough-pw", role: "admin" });
  const staffId = await createUser({ email: DEMO_ACCOUNTS.staff, name: "Taylor", password: "long-enough-pw", role: "staff" });
  admin = { id: adminId, email: DEMO_ACCOUNTS.admin, name: "Ashley Owner", role: "admin", locale: "en" };
  staff = { id: staffId, email: DEMO_ACCOUNTS.staff, name: "Taylor", role: "staff", locale: "en" };
  const a = await demoLogin(new Request("http://localhost/login"), "admin");
  const s = await demoLogin(new Request("http://localhost/login"), "staff");
  if (!a.ok || !s.ok) throw new Error("demo login failed");
  adminCookie = a.setCookie.split(";")[0];
  staffCookie = s.setCookie.split(";")[0];

  board = await createPerson({ full_name: "Bea Board", affiliations: ["board"], contact_mode: "direct", ...visible }, null);
  luis = await createPerson(
    {
      full_name: "Luis Banker",
      title: "Branch manager",
      skills: ["banking", "budgeting", "sewing"],
      contribution_types: ["skills_lesson"],
      email: "luis@example.org",
      phone: "410-555-0100",
      contact_mode: "direct",
      ...visible,
    },
    null,
  );
  sue = await createPerson(
    {
      full_name: "Sue Sewer",
      skills: ["sewing", "quilting"],
      contribution_types: ["skills_lesson"],
      email: "sue@example.org",
      phone: "410-555-0111",
      notes: "Secret note: zebra. Launchpad Innovation Center",
      funding_focus: "Private funding focus",
      origin: "Met at a private dinner",
      owner_user_id: adminId,
      contact_mode: "introduction",
      ...visible,
    },
    adminId,
  );
  dana = await createPerson(
    {
      full_name: "Dana Whitfield",
      title: "Program Officer",
      organization_name: "Chesapeake Youth Futures Fund",
      skills: ["sewing", "grant making"],
      contribution_types: ["funder"],
      email: "dana@example.org",
      notes: "Talked about the Launchpad Innovation Center",
      status: "active",
    },
    adminId,
  );
  hiddenMid = await createPerson({ full_name: "Hidden Middle", skills: ["sewing"], status: "active" }, null);
  tia = await createPerson({ full_name: "Tia Twohop", skills: ["welding"], ...visible }, null);

  await addRelationship({ personId: board, relatedPersonId: luis, kind: "knows" }, null);
  await addRelationship({ personId: luis, relatedPersonId: sue, kind: "colleague", note: "Sew together" }, null);
  await addRelationship({ personId: sue, relatedPersonId: dana, kind: "family" }, null);
  await addRelationship({ personId: board, relatedPersonId: hiddenMid, kind: "knows" }, null);
  await addRelationship({ personId: hiddenMid, relatedPersonId: tia, kind: "knows" }, null);

  const actor = { id: adminId, role: "admin" as const };
  const sueOpp = await createOpportunity(actor, { personId: sue, track: "engagement", kind: "skills_lesson", title: "Grant for the maker space", stage: "contacted" });
  await createOpportunity(actor, { personId: dana, track: "funding", kind: "grant", title: "Grant for the maker space 2", stage: "cultivating" });
  await createFollowUp(actor, { personId: sue, action: "Send the budget", dueOn: "2026-01-05", opportunityId: sueOpp });
  await createFollowUp(actor, { personId: dana, action: "Send the budget to Dana", dueOn: "2026-01-06" });

  capId = await createCap({ title: "Sewing CAP", topics: ["sewing"], needs: "sewing", teacher: "Ms. Taylor" }, adminId);
  await addCapPartner({ capId, personId: sue, status: "confirmed" }, adminId);
  await addCapPartner({ capId, personId: dana, status: "confirmed" }, adminId);
});

describe("staff tools", () => {
  const ctx = () => ({ user: staff });

  it("have no web search and no CRM tools, even with web search configured", async () => {
    const names = toolsFor({ web: true, strict: false, user: staff }).map((t) => t.name);
    expect(names).toEqual(STAFF_TOOLS.map((t) => t.name));
    for (const name of ["search_web", "list_follow_ups", "list_opportunities"]) {
      expect(names).not.toContain(name);
      expect(canUseTool(staff, name)).toBe(false);
      const out = await executeTool(name, { query: "oyster scientists", kind: "people", person_id: sue }, ctx());
      expect(out).toMatchObject({ isError: true, content: `Unknown tool: ${name}`, personIds: [] });
    }
    const adminNames = toolsFor({ web: true, strict: false, user: admin }).map((t) => t.name);
    expect(adminNames).toEqual(expect.arrayContaining(["search_web", "list_follow_ups", "list_opportunities"]));
  });

  it("never describe private fields, funders or the web", () => {
    const text = JSON.stringify(toolsFor({ web: true, strict: false, user: staff }));
    expect(text).not.toMatch(/notes|funding|funder|origin|owner|opportunit|follow-up|web|intake|sign-up|hidden|private/i);
  });

  it("never return hidden people or private fields, whatever is asked", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["search_people", { query: "sewing" }],
      ["search_people", { query: "Launchpad Innovation Center" }],
      ["search_people", { query: "zebra" }],
      ["search_people", { query: "Dana Whitfield" }],
      ["search_people", { query: "", contribution_types: ["funder"] }],
      ["search_people", { query: "", limit: 25 }],
      ["find_connectors_for_need", { query: "sewing" }],
      ["find_connectors_for_need", { query: "grant making" }],
      ["find_connectors_for_need", { query: "welding" }],
      ["list_caps", {}],
      ["list_caps", { mine: true }],
      ...[board, luis, sue, dana, hiddenMid, tia].flatMap((id): [string, Record<string, unknown>][] => [
        ["get_person", { person_id: id }],
        ["find_intro_paths", { person_id: id }],
      ]),
    ];
    for (const [name, input] of calls) {
      const out = await executeTool(name, input, ctx());
      expectStaffSafe(out.content);
      expect(out.personIds).not.toContain(dana);
      expect(out.personIds).not.toContain(hiddenMid);
      for (const reasons of Object.values(out.reasons ?? {})) expect(reasons.map((r) => r.kind)).not.toContain("notes");
    }
    expect((await executeTool("get_person", { person_id: dana }, ctx())).isError).toBe(true);
    expect((await executeTool("find_intro_paths", { person_id: hiddenMid }, ctx())).isError).toBe(true);
    // Tia is only reachable through a hidden person, so staff see no path.
    expect(JSON.parse((await executeTool("find_intro_paths", { person_id: tia }, ctx())).content).paths).toEqual([]);
  });

  it("say why someone matches and how to reach them, per contact mode", async () => {
    const body = JSON.parse((await executeTool("search_people", { query: "someone to teach financial literacy" }, ctx())).content);
    const hit = body.people.find((p: { id: string }) => p.id === luis);
    expect(hit.why).toMatch(/banking|budgeting/);
    expect(hit).toMatchObject({ contact: "direct", next_step: "contact", email: "luis@example.org" });

    const sewing = JSON.parse((await executeTool("search_people", { query: "sewing" }, ctx())).content);
    const sueHit = sewing.people.find((p: { id: string }) => p.id === sue);
    expect(sueHit).toMatchObject({
      contact: "introduction",
      next_step: "request_introduction",
      email: null,
      phone: null,
      request_introduction_url: `/app/requests/new?person=${sue}&intro=1`,
    });
  });

  it("list_caps counts only partners staff can see", async () => {
    const body = JSON.parse((await executeTool("list_caps", {}, ctx())).content);
    expect(body.caps.find((c: { id: string }) => c.id === capId)).toMatchObject({ partners: 1, confirmed: 1 });
    const forAdmin = JSON.parse((await executeTool("list_caps", {}, { user: admin })).content);
    expect(forAdmin.caps.find((c: { id: string }) => c.id === capId)).toMatchObject({ partners: 2, confirmed: 2 });
  });
});

describe("admin tools", () => {
  it("keep private fields and add read-only follow-ups and opportunities", async () => {
    const person = JSON.parse((await executeTool("get_person", { person_id: sue }, { user: admin })).content);
    expect(person.notes).toContain("zebra");
    expect(person.relationship_owner).toBe("Ashley Owner");

    const followUps = JSON.parse((await executeTool("list_follow_ups", { person_id: sue }, { user: admin })).content);
    expect(followUps.follow_ups.map((f: { action: string }) => f.action)).toEqual(["Send the budget"]);
    const all = JSON.parse((await executeTool("list_follow_ups", {}, { user: admin })).content);
    expect(all.follow_ups).toHaveLength(2);

    const opps = await executeTool("list_opportunities", { person_id: dana }, { user: admin });
    expect(JSON.parse(opps.content).opportunities[0]).toMatchObject({ title: "Grant for the maker space 2", track: "funding" });
    expect(opps.personIds).toEqual([dana]);
    expect((await executeTool("list_opportunities", { person_id: "nope" }, { user: admin })).isError).toBe(true);
  });
});

describe("the assistant", () => {
  it("gives staff a prompt with no private fields, funders, CRM tools or web search", () => {
    expect(systemPromptFor(staff)).toBe(STAFF_SYSTEM_PROMPT);
    expect(systemPromptFor(admin)).toBe(ADMIN_SYSTEM_PROMPT);
    expect(STAFF_SYSTEM_PROMPT).not.toMatch(/notes|funding|funder|origin|owner|opportunit|follow-up|web|intake|sign-up|hidden|private/i);
    expect(ADMIN_SYSTEM_PROMPT).toMatch(/search_web/);
    for (const prompt of [STAFF_SYSTEM_PROMPT, ADMIN_SYSTEM_PROMPT, STAFF_MCP_INSTRUCTIONS]) expect(prompt).not.toContain("—");
  });

  it("falls back to plain search, scoped to staff, with reasons and no web tip", async () => {
    for (const question of ["Who can teach sewing?", "Launchpad Innovation Center", "a funder for grant making", "Dana Whitfield"]) {
      const result = await runAssistant({ messages: [{ role: "user", content: question }], locale: "en", user: staff });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.mode).toBe("fallback");
      expectStaffSafe(result.answer, { asked: question });
      expect(result.answer).not.toMatch(/on the web/);
      expect(result.personIds).not.toContain(dana);
      expect(result.personIds).not.toContain(hiddenMid);
      const cards = await peopleForCards(result.personIds, staff, result.reasons);
      expectStaffSafe(JSON.stringify(cards));
    }
    const { answer } = await fallbackAnswer("someone to teach financial literacy", "en", staff);
    expect(answer).toMatch(/Why: .*(banking|budgeting) background/);
  });

  it("cards carry contact mode, contact details as staff may see them, and saved state", async () => {
    const cards = await peopleForCards([dana, sue, luis], staff);
    expect(cards.map((c) => c.id)).toEqual([sue, luis]);
    expect(cards[0]).toMatchObject({ contact_mode: "introduction", email: null, phone: null, saved: false });
    expect(cards[1]).toMatchObject({ contact_mode: "direct", email: "luis@example.org" });
  });
});

describe("the MCP connector", () => {
  const rpc = (method: string, params: Record<string, unknown> = {}) =>
    new Request("http://localhost/mcp/key", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  const call = async (user: SessionUser, method: string, params?: Record<string, unknown>) => {
    const response = await handleMcpRequest(rpc(method, params), user, "https://nva.example");
    expect(response.status).toBe(200);
    return (await response.json()) as { result: { tools?: { name: string; description: string }[]; content?: { text: string }[]; isError?: boolean } };
  };

  it("lists and runs only staff tools for a staff key", async () => {
    const list = await call(staff, "tools/list");
    const names = list.result.tools!.map((t) => t.name);
    expect(names).toEqual(STAFF_TOOLS.map((t) => t.name));
    expect(JSON.stringify(list.result.tools)).not.toMatch(/notes|funding|funder|web|private|hidden/i);

    for (const [name, params] of [
      ["search_people", { query: "sewing" }],
      ["find_connectors_for_need", { query: "Launchpad" }],
      ["get_person", { person_id: sue }],
    ] as const) {
      const out = await call(staff, "tools/call", { name, arguments: params });
      expect(out.result.isError).toBe(false);
      expectStaffSafe(out.result.content![0].text);
    }
    const hidden = await call(staff, "tools/call", { name: "get_person", arguments: { person_id: dana } });
    expect(hidden.result.isError).toBe(true);
    const web = await call(staff, "tools/call", { name: "search_web", arguments: { query: "oysters", kind: "any" } });
    expect(web.result).toMatchObject({ isError: true, content: [{ text: "Unknown tool: search_web" }] });
    const crm = await call(staff, "tools/call", { name: "list_follow_ups", arguments: {} });
    expect(crm.result.isError).toBe(true);
    expectStaffSafe(crm.result.content![0].text);
  });

  it("acts with the key owner's current role (keys made under open access keep working)", async () => {
    const formerAdminId = await createUser({ email: "former-admin@test", name: "Former Admin", password: "long-enough-pw", role: "admin" });
    const key = (await createMcpKey(formerAdminId, "Claude"))!;
    const asAdmin = (await userForMcpKey(key))!;
    expect(asAdmin.role).toBe("admin");
    expect((await call(asAdmin, "tools/list")).result.tools!.map((t) => t.name)).toContain("list_follow_ups");

    await query("UPDATE users SET role = 'staff' WHERE id = $1", [formerAdminId]);
    const asStaff = (await userForMcpKey(key))!;
    expect(asStaff.role).toBe("staff");
    const names = (await call(asStaff, "tools/list")).result.tools!.map((t) => t.name);
    expect(names).toEqual(STAFF_TOOLS.map((t) => t.name));
    const out = await call(asStaff, "tools/call", { name: "search_people", arguments: { query: "sewing" } });
    expectStaffSafe(out.result.content![0].text);
  });
});

describe("CAPs", () => {
  it("staff get 403 for every partner action; admins can manage partners", async () => {
    const route = await import("~/routes/app.caps.$capId");
    const params = { capId };
    const attempts: Record<string, string>[] = [
      { intent: "add-partner", personId: luis },
      { intent: "update-partner", personId: sue, status: "declined" },
      { intent: "remove-partner", personId: sue },
      { intent: "add-partner", personId: dana },
    ];
    for (const entries of attempts) {
      expect(await statusOf(route.action(args(req(`/app/caps/${capId}`, staffCookie, form(entries)), params)))).toBe(403);
    }
    // Nothing changed.
    expect((await getCapPartners(capId, admin)).map((p) => [p.person.id, p.status]).sort()).toEqual(
      [
        [dana, "confirmed"],
        [sue, "confirmed"],
      ].sort(),
    );
    expect(await statusOf(route.action(args(req(`/app/caps/${capId}`, adminCookie, form({ intent: "add-partner", personId: luis })), params)))).toBe(200);
    expect(
      await statusOf(route.action(args(req(`/app/caps/${capId}`, adminCookie, form({ intent: "remove-partner", personId: luis })), params))),
    ).toBe(200);
  });

  it("staff see CAPs and visible partners only, without the add-partner picker", async () => {
    const route = await import("~/routes/app.caps.$capId");
    const data = (await route.loader(args(req(`/app/caps/${capId}`, staffCookie), { capId }))) as {
      cap: { partner_count: number };
      canManage: boolean;
      partners: { person: { id: string } }[];
      partnerOptions: unknown[];
      suggestions: { person: { id: string } }[];
    };
    expect(data.canManage).toBe(false);
    expect(data.partners.map((p) => p.person.id)).toEqual([sue]);
    expect(data.cap.partner_count).toBe(1);
    expect(data.partnerOptions).toEqual([]);
    expect(data.suggestions.map((s) => s.person.id)).not.toContain(dana);
    // Page data uses the shared person shape: CRM categories are fine there, private fields come back empty.
    expectStaffSafe(JSON.stringify(data), { keys: PRIVATE_KEYS.filter((k) => k !== "categories") });
    expect((await getCap(capId, admin))!.partner_count).toBe(2);
    expect((await listCaps({}, staff)).find((c) => c.id === capId)!.partner_count).toBe(1);
  });

  it("My CAPs lists the CAPs a staff member teaches or started", async () => {
    const started = await createCap({ title: "Started by Taylor", status: "active" }, staff.id);
    const other = await createCap({ title: "Someone else's", teacher: "Andrea Brown" }, admin.id);
    const done = await createCap({ title: "Finished one", teacher: "taylor", status: "complete" }, admin.id);
    const mine = (await listMyCaps(staff)).map((c) => c.id);
    expect(mine).toEqual(expect.arrayContaining([capId, started]));
    expect(mine).not.toContain(other);
    expect(mine).not.toContain(done);
    expect((await listMyCaps(staff, { includeComplete: true })).map((c) => c.id)).toContain(done);
    expect(normalizeTeacherName("  Dr.  Sharonda   Scott ")).toBe("sharonda scott");
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_ACCOUNTS, createUser, demoLogin } from "./auth.server";
import { query } from "./db.server";
import {
  duplicateFingerprint,
  loadDirectory,
  parseDirectorySearch,
  parseQuickAddForm,
  quickAddContact,
  type QuickAddInput,
} from "./directory.server";
import { getOrganization, listOrganizations } from "./organizations.server";
import { createOpportunity } from "./opportunities.server";
import { createPerson } from "./people.server";
import { savePerson } from "./saved.server";

let adminId: string, staffId: string;
const admin = () => ({ id: adminId, role: "admin" as const });
const staff = () => ({ id: staffId, role: "staff" as const });
let adminCookie: string, staffCookie: string;
let visibleId: string, hiddenId: string, orgId: string;

const form = (entries: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) for (const value of [v].flat()) fd.append(k, value);
  return fd;
};
const quick = (entries: Record<string, string | string[]>): QuickAddInput => {
  const parsed = parseQuickAddForm(form(entries));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.input;
};
async function thrown(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (e: unknown) => e,
  );
}
async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await thrown(promise);
  expect(error).toBeInstanceOf(Response);
  expect((error as Response).status).toBe(status);
}
const req = (path: string, cookie: string, body?: FormData) =>
  new Request(`http://localhost${path}`, { method: body ? "POST" : "GET", headers: { Cookie: cookie }, body });
// Route modules take more args than these tests need.
const args = (request: Request, params: Record<string, string> = {}) => ({ request, params, context: {} }) as never;

beforeAll(async () => {
  vi.stubEnv("DEMO_LOGIN", "true");
  adminId = await createUser({ email: DEMO_ACCOUNTS.admin, name: "Ashley", password: "long-enough-pw", role: "admin" });
  staffId = await createUser({ email: DEMO_ACCOUNTS.staff, name: "Taylor", password: "long-enough-pw", role: "staff" });
  const a = await demoLogin(new Request("http://localhost/login"), "admin");
  const s = await demoLogin(new Request("http://localhost/login"), "staff");
  if (!a.ok || !s.ok) throw new Error("demo login failed");
  adminCookie = a.setCookie.split(";")[0];
  staffCookie = s.setCookie.split(";")[0];

  visibleId = await createPerson(
    {
      full_name: "Luisa Carpenter",
      email: "luisa@example.org",
      organization_name: "Bay Woodworks",
      organization_kind: "business",
      skills: ["carpentry", "woodworking"],
      contribution_types: ["skills_lesson"],
      status: "active",
      directory_visible: true,
      contact_mode: "direct",
      source: "intake",
    },
    null,
  );
  hiddenId = await createPerson(
    {
      full_name: "Hidden Funder",
      email: "funder@example.org",
      organization_name: "Bay Woodworks",
      skills: ["carpentry"],
      contribution_types: ["funder"],
      categories: ["prospective_funder"],
      status: "active",
      notes: "carpentry grant conversation",
      source: "admin",
    },
    null,
  );
  orgId = (await query<{ organization_id: string }>("SELECT organization_id FROM people WHERE id = $1", [visibleId]))[0]
    .organization_id;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("parseDirectorySearch", () => {
  const sp = "q=carpentry&status=lead&cat=funder&cat=bogus&vis=off&mode=direct&owner=u1&source=intake&type=skills_lesson";
  it("reads the admin filters", () => {
    const { params, filter } = parseDirectorySearch(new URLSearchParams(sp), admin());
    expect(params).toMatchObject({ categories: ["funder"], visibility: "off", mode: "direct", owner: "u1", source: "intake", status: "lead" });
    expect(filter).toMatchObject({ categories: ["funder"], directoryVisible: false, contactMode: "direct", ownerUserId: "u1", statuses: ["lead"] });
  });
  it("drops admin-only filters and status for staff", () => {
    const { params, filter } = parseDirectorySearch(new URLSearchParams(sp), staff());
    expect(params).toMatchObject({ categories: [], visibility: "", mode: "", owner: "", source: "", status: "", q: "carpentry" });
    expect(filter.categories).toBeUndefined();
    expect(filter.directoryVisible).toBeUndefined();
    expect(filter.statuses).toBeUndefined();
    expect(filter.contributionTypes).toEqual(["skills_lesson"]);
  });
});

describe("loadDirectory", () => {
  it("staff see only the staff directory, with reasons and saved state", async () => {
    await savePerson(staff(), visibleId);
    const data = await loadDirectory(staff(), new URLSearchParams("q=carpentry"));
    expect(data.isAdmin).toBe(false);
    expect(data.owners).toEqual([]);
    expect(data.people.map((p) => p.id)).toEqual([visibleId]);
    expect(data.people[0].reasons.length).toBeGreaterThan(0);
    expect(data.savedIds).toEqual([visibleId]);
    expect(JSON.stringify(data)).not.toContain("Hidden Funder");
  });

  it("admins filter by visibility, category and source", async () => {
    const hidden = await loadDirectory(admin(), new URLSearchParams("vis=off&q=carpentry"));
    expect(hidden.people.map((p) => p.id)).toEqual([hiddenId]);
    expect(hidden.owners.map((o) => o.id)).toContain(adminId);
    const funders = await loadDirectory(admin(), new URLSearchParams("cat=prospective_funder"));
    expect(funders.people.map((p) => p.id)).toEqual([hiddenId]);
    const signups = await loadDirectory(admin(), new URLSearchParams("source=intake"));
    expect(signups.people.map((p) => p.id)).toEqual([visibleId]);
    expect(signups.total).toBe(1);
  });
});

describe("parseQuickAddForm", () => {
  it("needs only a name and starts hidden with introduction-only contact", () => {
    expect(parseQuickAddForm(form({ full_name: " " }))).toEqual({ ok: false, errors: { full_name: "directory.quick.errorName" } });
    const input = quick({ full_name: "Ana Example" });
    expect(input.person).toMatchObject({ directory_visible: false, contact_mode: "introduction", categories: [], status: "new", source: "admin" });
    expect(input.followUp).toBeNull();
  });
  it("needs a follow-up date and action together", () => {
    expect(parseQuickAddForm(form({ full_name: "A", follow_up_on: "2026-11-02" }))).toMatchObject({
      ok: false,
      errors: { follow_up_action: "directory.quick.errorAction" },
    });
    expect(parseQuickAddForm(form({ full_name: "A", follow_up_action: "Call" }))).toMatchObject({
      ok: false,
      errors: { follow_up_on: "directory.quick.errorDateNeeded" },
    });
    expect(parseQuickAddForm(form({ full_name: "A", follow_up_on: "2026-02-31", follow_up_action: "Call" }))).toMatchObject({
      ok: false,
      errors: { follow_up_on: "directory.quick.errorDate" },
    });
    expect(parseQuickAddForm(form({ full_name: "A", email: "nope" }))).toMatchObject({ ok: false, errors: { email: "directory.quick.errorEmail" } });
  });
  it("keeps the admin's choices", () => {
    const input = quick({
      full_name: "Ana",
      categories: ["internship_host", "funder", "nope"],
      directory_visible: "on",
      contact_mode: "direct",
      owner_user_id: "none",
    });
    expect(input.person).toMatchObject({ categories: ["internship_host", "funder"], directory_visible: true, contact_mode: "direct", owner_user_id: null });
  });
});

describe("quickAddContact", () => {
  it("is admin only", async () => {
    await expectStatus(quickAddContact(staff(), quick({ full_name: "Sneaky" })), 403);
  });

  it("a possible duplicate blocks the first save; Save anyway needs the same details", async () => {
    const input = quick({ full_name: "Luisa C.", email: "LUISA@example.org" });
    const first = await quickAddContact(admin(), input);
    expect(first.status).toBe("duplicates");
    if (first.status !== "duplicates") return;
    expect(first.duplicates[0]).toMatchObject({ id: visibleId, reasons: ["email"] });
    expect(first.fingerprint).toBe(duplicateFingerprint(input.person));

    // A stale confirmation (details changed since the check) checks again.
    const changed = quick({ full_name: "Luisa C.", email: "luisa@example.org", phone: "410 555 0199" });
    expect((await quickAddContact(admin(), changed, { confirmed: first.fingerprint })).status).toBe("duplicates");

    const saved = await quickAddContact(admin(), input, { confirmed: first.fingerprint });
    expect(saved.status).toBe("created");
  });

  it("saves the contact with a contact_created entry and the follow-up", async () => {
    const input = quick({
      full_name: "Jordan Smith",
      organization_name: "Harbor Bank",
      phone: "410-555-0142",
      notes: "Met at the community reception.",
      origin: "Community reception",
      categories: ["internship_host"],
      follow_up_on: "2026-11-05",
      follow_up_action: "Send information about internship opportunities",
    });
    const result = await quickAddContact(admin(), input);
    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    const person = (await query<Record<string, unknown>>("SELECT * FROM people WHERE id = $1", [result.personId]))[0];
    expect(person).toMatchObject({
      directory_visible: false,
      contact_mode: "introduction",
      notes: "Met at the community reception.",
      origin: "Community reception",
      categories: ["internship_host"],
      source: "admin",
      created_by: adminId,
    });
    const history = await query<{ kind: string; visibility: string }>(
      "SELECT kind, visibility FROM engagements WHERE person_id = $1 ORDER BY kind",
      [result.personId],
    );
    expect(history).toEqual([
      { kind: "contact_created", visibility: "admin" },
      { kind: "follow_up_scheduled", visibility: "admin" },
    ]);
    const followUps = await query<{ id: string; action: string; owner_user_id: string; status: string }>(
      "SELECT id, action, owner_user_id, status FROM follow_ups WHERE person_id = $1",
      [result.personId],
    );
    expect(followUps).toEqual([
      { id: result.followUpId, action: "Send information about internship opportunities", owner_user_id: adminId, status: "open" },
    ]);
  });

  it("refuses an owner who is not an admin", async () => {
    const result = await quickAddContact(admin(), quick({ full_name: "Owner Test", owner_user_id: staffId }));
    expect(result).toEqual({ status: "invalid", errors: { owner_user_id: "directory.quick.errorOwner" } });
  });
});

describe("organizations", () => {
  it("are admin only", async () => {
    await expectStatus(listOrganizations(staff()), 403);
    await expectStatus(getOrganization(staff(), orgId), 403);
  });

  it("list people counts and open opportunities", async () => {
    await createOpportunity(admin(), { personId: hiddenId, title: "Shop grant", track: "funding", kind: "grant", stage: "cultivating" });
    const list = await listOrganizations(admin(), { q: "woodworks" });
    expect(list).toEqual([
      expect.objectContaining({ id: orgId, name: "Bay Woodworks", people_count: 2, visible_count: 1, open_opportunities: 1 }),
    ]);
    const org = await getOrganization(admin(), orgId);
    expect(org?.people.map((p) => p.full_name)).toEqual(["Hidden Funder", "Luisa Carpenter"]);
    expect(org?.opportunities.map((o) => o.title)).toEqual(["Shop grant"]);
    expect(await getOrganization(admin(), "missing")).toBeNull();
  });
});

describe("routes", () => {
  it("staff get a 403 on quick add and organizations", async () => {
    const quickAdd = await import("~/routes/app.people.new");
    const orgs = await import("~/routes/app.organizations._index");
    const org = await import("~/routes/app.organizations.$orgId");
    await expectStatus(quickAdd.loader(args(req("/app/people/new", staffCookie))), 403);
    await expectStatus(quickAdd.action(args(req("/app/people/new", staffCookie, form({ full_name: "Sneaky" })))), 403);
    await expectStatus(orgs.loader(args(req("/app/organizations", staffCookie))), 403);
    await expectStatus(org.loader(args(req(`/app/organizations/${orgId}`, staffCookie), { orgId })), 403);
    expect((await query("SELECT 1 FROM people WHERE full_name = 'Sneaky'")).length).toBe(0);
  });

  it("quick add warns on a duplicate first, then saves", async () => {
    const quickAdd = await import("~/routes/app.people.new");
    const body = { full_name: "Luisa Carpenter", organization_name: "Bay Woodworks" };
    const first = (await quickAdd.action(args(req("/app/people/new", adminCookie, form(body))))) as unknown as {
      init: { status: number };
      data: { duplicates: { id: string }[]; fingerprint: string };
    };
    expect(first.init.status).toBe(409);
    expect(first.data.duplicates.map((d) => d.id)).toContain(visibleId);
    const second = (await quickAdd.action(
      args(req("/app/people/new", adminCookie, form({ ...body, confirm: first.data.fingerprint }))),
    )) as unknown as Response;
    expect(second.status).toBe(302);
    expect(second.headers.get("Location")).toMatch(/^\/app\/people\/[\w-]+$/);
  });

  it("the directory page serves both roles", async () => {
    const people = await import("~/routes/app.people._index");
    const asStaff = await people.loader(args(req("/app/people?q=carpentry", staffCookie)));
    expect(asStaff.isAdmin).toBe(false);
    expect(asStaff.people.map((p) => p.id)).toEqual([visibleId]);
    const asAdmin = await people.loader(args(req("/app/people?q=carpentry", adminCookie)));
    expect(asAdmin.isAdmin).toBe(true);
    expect(asAdmin.people.map((p) => p.id)).toContain(hiddenId);
  });
});

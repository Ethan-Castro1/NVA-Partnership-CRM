/**
 * The contact profile and edit routes, end to end through their loaders and
 * actions with real sessions: staff get only the staff variant (no notes,
 * no CRM, no contact details unless direct), a 404 for hidden people, and a
 * 403 for every admin write; admins get the full record and the duplicate
 * check on edit.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { action as editAction, loader as editLoader } from "~/routes/app.people.$personId.edit";
import { action, loader } from "~/routes/app.people.$personId";
import { DEMO_ACCOUNTS, createUser, demoLogin } from "./auth.server";
import { createCap } from "./caps.server";
import { query, queryOne } from "./db.server";
import { recordHistory } from "./history.server";
import { createPerson, getPerson } from "./people.server";

let adminCookie = "";
let staffCookie = "";
let direct: string, intro: string, hidden: string, twin: string;

const SECRET_NOTE = "Launchpad Innovation Center conversation";
const SECRET_FOCUS = "Youth workforce grants";
const SECRET_ORIGIN = "Met at the gala";

async function signIn(role: "admin" | "staff"): Promise<string> {
  const result = await demoLogin(new Request("http://localhost/login"), role);
  if (!result.ok) throw new Error("demo login failed");
  return result.setCookie.split(";")[0];
}

function req(cookie: string, path: string, form?: Record<string, string>): Request {
  const headers = { Cookie: cookie };
  if (!form) return new Request(`http://localhost${path}`, { headers });
  return new Request(`http://localhost${path}`, { method: "POST", headers, body: new URLSearchParams(form) });
}

/** The status of a thrown or returned Response / data() result. */
function statusOf(value: unknown): number {
  if (value instanceof Response) return value.status;
  const init = (value as { init?: { status?: number } } | null)?.init;
  return init?.status ?? 200;
}

async function thrown(promise: Promise<unknown>): Promise<number> {
  return promise.then(
    (v) => statusOf(v),
    (e: unknown) => statusOf(e),
  );
}

const profile = (cookie: string, personId: string) =>
  loader({ request: req(cookie, `/app/people/${personId}`), params: { personId }, context: {} } as never);
const post = (cookie: string, personId: string, form: Record<string, string>) =>
  action({ request: req(cookie, `/app/people/${personId}`, form), params: { personId }, context: {} } as never);
const edit = (cookie: string, personId: string, form: Record<string, string>) =>
  editAction({ request: req(cookie, `/app/people/${personId}/edit`, form), params: { personId }, context: {} } as never);

beforeAll(async () => {
  vi.stubEnv("DEMO_LOGIN", "true");
  await createUser({ email: DEMO_ACCOUNTS.admin, name: "Ashley", password: "long-enough-pw", role: "admin" });
  await createUser({ email: DEMO_ACCOUNTS.staff, name: "Taylor", password: "long-enough-pw", role: "staff" });
  adminCookie = await signIn("admin");
  staffCookie = await signIn("staff");

  const shared = { status: "active" as const, directory_visible: true, notes: SECRET_NOTE, funding_focus: SECRET_FOCUS, origin: SECRET_ORIGIN };
  direct = await createPerson(
    { full_name: "Dee Direct", email: "dee@example.org", phone: "410-555-0111", contact_mode: "direct", ...shared },
    null,
  );
  intro = await createPerson(
    { full_name: "Ivy Intro", email: "ivy@example.org", phone: "410-555-0122", contact_mode: "introduction", ...shared },
    null,
  );
  hidden = await createPerson(
    { full_name: "Dana Hidden", email: "dana@example.org", status: "active", notes: SECRET_NOTE, categories: ["prospective_funder"] },
    null,
  );
  twin = await createPerson({ full_name: "Rosa Twin", email: "rosa@example.org", organization_name: "Bay Tailors" }, null);

  await recordHistory({ personId: intro, kind: "call", origin: "manual", visibility: "admin", notes: "Private call notes" });
  await recordHistory({ personId: intro, kind: "lesson", origin: "manual", visibility: "staff", notes: "Taught knots" });
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("profile loader", () => {
  it("is a 404 for staff on a hidden or missing person, but loads for admins with notes and CRM", async () => {
    expect(await thrown(profile(staffCookie, hidden))).toBe(404);
    expect(await thrown(profile(staffCookie, "no-such-person"))).toBe(404);

    const asAdmin = await profile(adminCookie, hidden);
    expect(asAdmin.view).toBe("admin");
    if (asAdmin.view !== "admin") return;
    expect(asAdmin.person.notes).toBe(SECRET_NOTE);
    expect(asAdmin.crm).toMatchObject({ opportunities: [], followUps: [] });
  });

  it("gives staff no notes, CRM fields, admin history or contact details for an introduction-mode person", async () => {
    const data = await profile(staffCookie, intro);
    expect(data.view).toBe("staff");
    const json = JSON.stringify(data);
    for (const secret of [SECRET_NOTE, SECRET_FOCUS, SECRET_ORIGIN, "ivy@example.org", "410-555-0122", "Private call notes"]) {
      expect(json).not.toContain(secret);
    }
    for (const key of ["funding_focus", "owner_user_id", "owner_name", "crm", "paths", "relationships", "peopleOptions"]) {
      expect(json).not.toContain(`"${key}":`);
    }
    expect(Object.keys(data.person)).not.toContain("notes");
    expect(data.history.map((h) => h.kind)).toEqual(["lesson"]);
    expect(data.person.email).toBeNull();
    expect(data.person.phone).toBeNull();
  });

  it("shows staff the email and phone of a direct-contact person", async () => {
    const data = await profile(staffCookie, direct);
    expect(data.view).toBe("staff");
    expect(data.person.email).toBe("dee@example.org");
    expect(data.person.phone).toBe("410-555-0111");
    expect(JSON.stringify(data)).not.toContain(SECRET_NOTE);
  });
});

describe("profile actions", () => {
  it("refuses every admin intent from staff with a 403 and changes nothing", async () => {
    const engagement = await queryOne<{ id: string }>("SELECT id FROM engagements WHERE person_id = $1 LIMIT 1", [intro]);
    const admin: Record<string, string>[] = [
      { intent: "setStatus", status: "inactive" },
      { intent: "setVisibility", directory_visible: "false", contact_mode: "direct" },
      { intent: "deletePerson" },
      { intent: "addConnection", related_person_id: direct, kind: "knows" },
      { intent: "addToCap", cap_id: "any" },
      { intent: "deleteEngagement", target_id: engagement!.id },
      { intent: "removeRelationship", target_id: "x" },
    ];
    for (const form of admin) expect(await thrown(post(staffCookie, intro, form)), form.intent).toBe(403);
    // A real CAP, so the 403 comes from the role check, not a missing CAP.
    const owner = await queryOne<{ id: string }>("SELECT id FROM users WHERE email = $1", [DEMO_ACCOUNTS.admin]);
    const capId = await createCap({ title: "Profile test CAP" }, owner!.id);
    expect(await thrown(post(staffCookie, intro, { intent: "addToCap", cap_id: capId })), "addToCap real cap").toBe(403);
    expect(await query("SELECT 1 FROM cap_partners WHERE person_id = $1", [intro])).toHaveLength(0);
    const after = await getPerson(intro, { id: "x", role: "admin" });
    expect(after).toMatchObject({ status: "active", directory_visible: true, contact_mode: "introduction" });
  });

  it("lets staff log only the work itself", async () => {
    expect(await thrown(post(staffCookie, intro, { intent: "logEngagement", kind: "call" }))).toBe(403);
    expect(await thrown(post(staffCookie, intro, { intent: "logEngagement", kind: "note", notes: "x" }))).toBe(403);
    expect(await thrown(post(staffCookie, intro, { intent: "logEngagement", kind: "volunteer", notes: "Helped at the fair" }))).toBe(200);
    const row = await queryOne<{ visibility: string; origin: string }>(
      "SELECT visibility, origin FROM engagements WHERE person_id = $1 AND notes = 'Helped at the fair'",
      [intro],
    );
    expect(row).toEqual({ visibility: "staff", origin: "manual" });
    // It shows as staff-logged on the profile.
    const data = await profile(adminCookie, intro);
    expect(data.staffAuthored.length).toBe(1);
  });

  it("is a 404 for staff posting to a hidden person", async () => {
    expect(await thrown(post(staffCookie, hidden, { intent: "logEngagement", kind: "lesson" }))).toBe(404);
  });

  it("lets admins change staff access in place and remove only manual entries", async () => {
    expect(await thrown(post(adminCookie, hidden, { intent: "setVisibility", directory_visible: "true", contact_mode: "direct" }))).toBe(200);
    expect(await getPerson(hidden, { id: "x", role: "admin" })).toMatchObject({ directory_visible: true, contact_mode: "direct" });
    expect(await thrown(post(adminCookie, hidden, { intent: "setVisibility", directory_visible: "maybe", contact_mode: "direct" }))).toBe(400);
    await query("UPDATE people SET directory_visible = false WHERE id = $1", [hidden]);

    const synced = await recordHistory({ personId: hidden, kind: "email_received", origin: "email", visibility: "admin", notes: "Re: visit" });
    expect(await thrown(post(adminCookie, hidden, { intent: "deleteEngagement", target_id: synced }))).toBe(404);
    const typed = await recordHistory({ personId: hidden, kind: "note", origin: "manual", visibility: "admin", notes: "typo" });
    expect(await thrown(post(adminCookie, hidden, { intent: "deleteEngagement", target_id: typed }))).toBe(200);
  });
});

describe("edit route", () => {
  const base = { full_name: "Dana Hidden", email: "dana@example.org", status: "active", contact_mode: "introduction" };

  it("is admin only", async () => {
    expect(
      await thrown(editLoader({ request: req(staffCookie, `/app/people/${direct}/edit`), params: { personId: direct }, context: {} } as never)),
    ).toBe(403);
    expect(await thrown(edit(staffCookie, direct, { ...base, full_name: "Hacked" }))).toBe(403);
  });

  it("saves the CRM fields and checks the owner is an admin", async () => {
    const owner = await queryOne<{ id: string }>("SELECT id FROM users WHERE email = $1", [DEMO_ACCOUNTS.admin]);
    const staffUser = await queryOne<{ id: string }>("SELECT id FROM users WHERE email = $1", [DEMO_ACCOUNTS.staff]);
    expect(await thrown(edit(adminCookie, hidden, { ...base, owner_user_id: staffUser!.id }))).toBe(400);
    const saved = await thrown(
      edit(adminCookie, hidden, {
        ...base,
        owner_user_id: owner!.id,
        categories: "prospective_funder",
        origin: "Met at the reception",
        shared_summary: "Knows grants",
        location: "Eastport",
        directory_visible: "on",
      }),
    );
    expect(saved).toBe(302);
    expect(await getPerson(hidden, { id: "x", role: "admin" })).toMatchObject({
      owner_user_id: owner!.id,
      categories: ["prospective_funder"],
      origin: "Met at the reception",
      shared_summary: "Knows grants",
      location: "Eastport",
      directory_visible: true,
    });
    await query("UPDATE people SET directory_visible = false WHERE id = $1", [hidden]);
  });

  it("warns about likely duplicates when the name or email changes, and saves after confirming", async () => {
    const renamed = { ...base, full_name: "Rosa Twin", organization_name: "Bay Tailors" };
    const warned = await edit(adminCookie, hidden, renamed);
    expect(statusOf(warned)).toBe(409);
    const body = (warned as unknown as { data: { duplicates: { id: string; reasons: string[] }[] } }).data;
    expect(body.duplicates[0]).toMatchObject({ id: twin });
    expect(body.duplicates[0].reasons).toContain("name_org");
    expect(await thrown(edit(adminCookie, hidden, { ...renamed, confirm_duplicates: "1" }))).toBe(302);

    // Another record's exact email always blocks, even when confirmed.
    const sameEmail = await edit(adminCookie, hidden, { ...renamed, email: "rosa@example.org", confirm_duplicates: "1" });
    expect(statusOf(sameEmail)).toBe(409);
    expect((sameEmail as unknown as { data: { duplicateId: string } }).data.duplicateId).toBe(twin);

    // No change to name or email: no check.
    expect(await thrown(edit(adminCookie, hidden, { ...renamed, location: "Annapolis" }))).toBe(302);
  });
});

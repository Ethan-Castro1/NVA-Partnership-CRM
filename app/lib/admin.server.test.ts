import { describe, expect, it } from "vitest";
import {
  accountChangeProblem,
  changeStaffAccount,
  csvCell,
  getAdminOverview,
  getIntakeSubmission,
  matchPerson,
  nextNewIntake,
  readPayload,
  setIntakeStatus,
  toCsv,
} from "./admin.server";
import { createUser } from "./auth.server";
import { addCapPartner, createCap } from "./caps.server";
import { newId, query, queryOne } from "./db.server";
import { addRelationship, createPerson, logEngagement } from "./people.server";

describe("CSV export escaping", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("Smith, Jo")).toBe('"Smith, Jo"');
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(["sewing", "welding"])).toBe("sewing; welding");
    expect(csvCell("Lucía Núñez")).toBe("Lucía Núñez");
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1 410 555 0100")).toBe("'+1 410 555 0100");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe(`"'\rcmd"`);
    // Only a leading character matters.
    expect(csvCell("a=b")).toBe("a=b");
  });

  it("builds a file with a BOM and CRLF rows", () => {
    const csv = toCsv([
      ["Name", "Skills"],
      ["Ana", ["a", "b"]],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Name,Skills\r\nAna,a; b\r\n");
  });
});

describe("account guard rails", () => {
  const admin = { id: "a1", role: "admin" as const, active: true };
  const teacher = { id: "t1", role: "staff" as const, active: true };

  it("stops admins from demoting or deactivating themselves", () => {
    expect(accountChangeProblem("a1", admin, { kind: "role", role: "staff" }, 3)).toBe("admin.error.self");
    expect(accountChangeProblem("a1", admin, { kind: "active", active: false }, 3)).toBe("admin.error.self");
    expect(accountChangeProblem("a1", admin, { kind: "role", role: "admin" }, 1)).toBeNull();
  });

  it("keeps at least one active admin", () => {
    expect(accountChangeProblem("x", admin, { kind: "role", role: "staff" }, 1)).toBe("admin.error.lastAdmin");
    expect(accountChangeProblem("x", admin, { kind: "active", active: false }, 1)).toBe("admin.error.lastAdmin");
    expect(accountChangeProblem("x", admin, { kind: "role", role: "staff" }, 2)).toBeNull();
    // An already-deactivated admin isn't one of the active ones, so demoting them is fine.
    expect(accountChangeProblem("x", { ...admin, active: false }, { kind: "role", role: "staff" }, 1)).toBeNull();
  });

  it("lets admins change teachers freely", () => {
    expect(accountChangeProblem("a1", teacher, { kind: "role", role: "admin" }, 1)).toBeNull();
    expect(accountChangeProblem("a1", teacher, { kind: "active", active: false }, 1)).toBeNull();
  });

  it("is enforced against the database", async () => {
    const first = await createUser({ email: "first@test.local", name: "First", password: "x".repeat(12), role: "admin" });
    const second = await createUser({ email: "second@test.local", name: "Second", password: "x".repeat(12), role: "admin" });
    const teacher = await createUser({ email: "t@test.local", name: "Teach", password: "x".repeat(12), role: "staff" });

    expect(await changeStaffAccount(first, first, { kind: "role", role: "staff" })).toEqual({ ok: false, error: "admin.error.self" });
    expect(await changeStaffAccount(first, second, { kind: "role", role: "staff" })).toEqual({ ok: true });
    // `first` is now the only active admin. Promote the teacher so there are two again.
    expect(await changeStaffAccount(first, teacher, { kind: "role", role: "admin" })).toEqual({ ok: true });
    expect(await changeStaffAccount(teacher, first, { kind: "active", active: false })).toEqual({ ok: true });
    expect(await changeStaffAccount(teacher, first, { kind: "active", active: true })).toEqual({ ok: true });

    // Make `teacher` (now an admin) the last active admin and try to remove them via someone else.
    await query("UPDATE users SET active = false WHERE id = $1", [first]);
    expect(await changeStaffAccount(second, teacher, { kind: "role", role: "staff" })).toEqual({
      ok: false,
      error: "admin.error.lastAdmin",
    });
    expect(await changeStaffAccount(first, "missing", { kind: "active", active: true })).toEqual({
      ok: false,
      error: "admin.error.userNotFound",
    });
  });
});

describe("sign-up review", () => {
  it("reads payloads defensively", () => {
    const p = readPayload({
      full_name: "  Ana  ",
      email: "ana@example.org",
      contribution_types: ["internship", "bogus"],
      affiliations: ["parent", "student"],
      skills: ["sewing", 4, ""],
      referrals: [{ name: "Bo", kind: "nope" }, { email: "no-name@example.org" }],
      preferred_language: "fr",
    });
    expect(p.full_name).toBe("Ana");
    expect(p.contribution_types).toEqual(["internship"]);
    expect(p.affiliations).toEqual(["parent"]);
    expect(p.skills).toEqual(["sewing"]);
    expect(p.preferred_language).toBe("en");
    expect(p.referrals).toHaveLength(1);
    expect(p.referrals[0].kind).toBeUndefined();
    expect(p.consent).toBe(false);
  });

  it("matches by email first, then by name", () => {
    const c = (id: string, full_name: string, email: string | null) => ({ id, full_name, email, source: "referral" as const, status: "lead" as const });
    expect(matchPerson({ name: "X", email: "SAM@x.org" }, [], [c("1", "Sam", "sam@x.org")])?.id).toBe("1");
    expect(matchPerson({ name: "sam  lee" }, [c("2", "Sam Lee", null)], [c("3", "Sam Lee", null)])?.id).toBe("2");
    expect(matchPerson({ name: "Nobody" }, [], [c("3", "Sam Lee", null)])).toBeNull();
  });

  it("links referrals, records the reviewer and can activate the person", async () => {
    const reviewer = await createUser({ email: "rev@test.local", name: "Rev", password: "x".repeat(12), role: "admin" });
    const referrer = await createPerson({ full_name: "Aisha Khan", affiliations: ["board"], status: "active" }, null);
    const person = await createPerson({ full_name: "Jordan Ellis", email: "jordan@example.org", source: "intake" }, null);
    const lead = await createPerson({ full_name: "Sofia Bauer", status: "lead", source: "referral" }, null);
    await addRelationship({ personId: referrer, relatedPersonId: person, kind: "referred" }, null);
    await addRelationship({ personId: person, relatedPersonId: lead, kind: "referred" }, null);
    const id = newId();
    await query("INSERT INTO intake_submissions (id, person_id, payload, locale) VALUES ($1,$2,$3,'en')", [
      id,
      person,
      JSON.stringify({
        full_name: "Jordan Ellis",
        email: "jordan@example.org",
        preferred_language: "en",
        contribution_types: ["skills_lesson"],
        skills: [],
        cap_topics: [],
        affiliations: [],
        referred_by: { name: "Aisha Khan" },
        referrals: [{ name: "Sofia Bauer" }, { name: "Unknown Person" }],
        consent: true,
      }),
    ]);

    const detail = await getIntakeSubmission(id);
    expect(detail?.referredBy?.id).toBe(referrer);
    expect(detail?.referrals.map((r) => r.match?.id ?? null)).toEqual([lead, null]);

    expect(await setIntakeStatus(id, "approved", reviewer, { activatePerson: true })).toBe(true);
    const row = await queryOne<{ status: string; reviewed_by: string; reviewed_at: Date | null }>(
      "SELECT status, reviewed_by, reviewed_at FROM intake_submissions WHERE id = $1",
      [id],
    );
    expect(row?.status).toBe("approved");
    expect(row?.reviewed_by).toBe(reviewer);
    expect(row?.reviewed_at).toBeTruthy();
    expect((await queryOne<{ status: string }>("SELECT status FROM people WHERE id = $1", [person]))?.status).toBe("active");

    await setIntakeStatus(id, "new", reviewer);
    const back = await queryOne<{ status: string; reviewed_by: string | null }>(
      "SELECT status, reviewed_by FROM intake_submissions WHERE id = $1",
      [id],
    );
    expect(back).toEqual({ status: "new", reviewed_by: null });
    expect(await setIntakeStatus("missing", "archived", reviewer)).toBe(false);
  });
});

describe("next sign-up to review", () => {
  it("picks the newest other sign-up that is still new", async () => {
    const reviewer = await createUser({ email: "next@test.local", name: "Next", password: "x".repeat(12), role: "admin" });
    const [a, b] = [newId(), newId()];
    await query(
      `INSERT INTO intake_submissions (id, payload, locale, submitted_at) VALUES
         ($1, '{}', 'en', '2099-01-02T00:00:00Z'), ($2, '{}', 'en', '2099-01-01T00:00:00Z')`,
      [a, b],
    );
    expect(await nextNewIntake(a)).toBe(b);
    expect(await nextNewIntake(b)).toBe(a);
    await setIntakeStatus(a, "archived", reviewer);
    expect(await nextNewIntake(b)).not.toBe(a);
  });
});

describe("needs attention", () => {
  it("lists leads with their last contact and CAPs without a confirmed partner", async () => {
    const owner = await createUser({ email: "owner@test.local", name: "Owner", password: "x".repeat(12), role: "staff" });
    const quiet = await createPerson({ full_name: "Quiet Lead", status: "lead" }, null);
    const called = await createPerson({ full_name: "Called Lead", status: "lead" }, null);
    await logEngagement({ personId: called, kind: "call", happenedOn: "2026-09-01" }, owner);
    const partner = await createPerson({ full_name: "Confirmed Partner", status: "active" }, null);

    const open = await createCap({ title: "Open CAP", status: "planning" }, owner);
    const suggestedOnly = await createCap({ title: "Suggested only", status: "active" }, owner);
    const staffed = await createCap({ title: "Staffed CAP", status: "active" }, owner);
    const done = await createCap({ title: "Done CAP", status: "complete" }, owner);
    await addCapPartner({ capId: suggestedOnly, personId: partner }, owner);
    await addCapPartner({ capId: staffed, personId: partner, status: "confirmed" }, owner);

    const { leads, capsWithoutPartner } = await getAdminOverview({ id: "test-admin", role: "admin" });
    const byId = new Map(leads.map((l) => [l.id, l]));
    expect(byId.get(quiet)?.last_contact).toBeNull();
    expect(byId.get(called)?.last_contact).toBe("2026-09-01");
    expect(byId.has(partner)).toBe(false);

    const capIds = capsWithoutPartner.map((c) => c.id);
    expect(capIds).toContain(open);
    expect(capIds).toContain(suggestedOnly);
    expect(capIds).not.toContain(staffed);
    expect(capIds).not.toContain(done);
    expect(capsWithoutPartner.find((c) => c.id === open)?.owner_name).toBe("Owner");
  });
});

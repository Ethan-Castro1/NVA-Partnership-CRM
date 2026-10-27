import { beforeAll, describe, expect, it } from "vitest";
import { setIntakeStatus } from "./admin.server";
import { createUser, login } from "./auth.server";
import { newId, query, queryOne } from "./db.server";
import { listHistory } from "./history.server";
import type { IntakePayload } from "./intake-types";
import {
  RATE_MAX,
  approveIntake,
  isHoneypotFilled,
  isIntakeRateLimited,
  linkIntake,
  processIntake,
  readIntakeEdits,
  readIntakeForm,
  recordIntakeAttempt,
  rejectIntake,
  saveIntakeEdits,
  validateIntake,
} from "./intake.server";
import { createPerson, getPerson, getRelationships, searchPeople } from "./people.server";
import type { SessionUser } from "./types";
import { action as reviewAction, loader as reviewLoader } from "~/routes/app.admin.intake.$submissionId";
import { loader as queueLoader } from "~/routes/app.admin.intake._index";

let admin: SessionUser;
let staff: SessionUser;
let staffCookie = "";
let adminCookie = "";

beforeAll(async () => {
  const adminId = await createUser({ email: "intake-admin@test", name: "Ida Admin", password: "long-enough-pw", role: "admin" });
  const staffId = await createUser({ email: "intake-staff@test", name: "Stu Staff", password: "long-enough-pw", role: "staff" });
  admin = { id: adminId, email: "intake-admin@test", name: "Ida Admin", role: "admin", locale: "en" };
  staff = { id: staffId, email: "intake-staff@test", name: "Stu Staff", role: "staff", locale: "en" };
  const cookieOf = (result: Awaited<ReturnType<typeof login>>) => (result.ok ? result.setCookie.split(";")[0] : "");
  staffCookie = cookieOf(await login(new Request("http://localhost/login"), "intake-staff@test", "long-enough-pw"));
  adminCookie = cookieOf(await login(new Request("http://localhost/login"), "intake-admin@test", "long-enough-pw"));
});

const base = (overrides: Partial<IntakePayload> = {}): IntakePayload => ({
  full_name: "Ana Rivera",
  email: "ana@example.test",
  phone: null,
  preferred_language: "es",
  organization: null,
  title: null,
  contribution_types: ["skills_lesson"],
  skills: ["sewing"],
  cap_topics: [],
  availability: null,
  bio: null,
  affiliations: ["parent"],
  referred_by: null,
  referrals: [],
  consent: true,
  ...overrides,
});

const countByEmail = async (email: string) =>
  (await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM people WHERE lower(email) = lower($1)", [email]))?.n ?? 0;

const submissionRow = (id: string) =>
  queryOne<{ status: string; person_id: string | null; matched_person_id: string | null; decided_by: string | null; decision_note: string | null; payload: IntakePayload; edited_payload: IntakePayload | null }>(
    "SELECT status, person_id, matched_person_id, decided_by, decision_note, payload, edited_payload FROM intake_submissions WHERE id = $1",
    [id],
  );

describe("processIntake", () => {
  it("only saves the submission for review: no contact is created", async () => {
    const payload = base({ email: "only-saved@example.test", organization: "Rivera Tailoring" });
    const { submissionId, matchedPersonId } = await processIntake(payload, "es");
    expect(matchedPersonId).toBeNull();
    expect(await countByEmail("only-saved@example.test")).toBe(0);
    const row = await submissionRow(submissionId);
    expect(row).toMatchObject({ status: "new", person_id: null, matched_person_id: null });
    expect(row?.payload.organization).toBe("Rivera Tailoring");
  });

  it("remembers an existing record with the same email", async () => {
    const existing = await createPerson({ full_name: "Marcus Bell", email: "marcus@example.test", status: "active" }, null);
    const { submissionId, matchedPersonId } = await processIntake(base({ full_name: "Marcus B.", email: "Marcus@Example.test" }), "en");
    expect(matchedPersonId).toBe(existing);
    expect((await submissionRow(submissionId))?.person_id).toBeNull();
    expect(await countByEmail("marcus@example.test")).toBe(1);
  });
});

describe("approving a sign-up", () => {
  it("creates a person hidden from staff with introduction-only contact, and records history", async () => {
    const { submissionId } = await processIntake(
      base({ full_name: "Walt Carpenter", email: "walt@example.test", phone: "410-555-0177", skills: ["carpentry"], availability: "Fridays" }),
      "en",
    );
    const result = await approveIntake(admin, submissionId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const person = await getPerson(result.personId!, admin);
    expect(person).toMatchObject({
      full_name: "Walt Carpenter",
      email: "walt@example.test",
      status: "active",
      source: "intake",
      directory_visible: false,
      contact_mode: "introduction",
      skills: ["carpentry"],
      availability: "Fridays",
    });
    expect(await getPerson(result.personId!, staff)).toBeNull();

    const kinds = (await listHistory(result.personId!, admin)).map((h) => h.kind).sort();
    expect(kinds).toEqual(["contact_created", "signup_approved", "signup_submitted"]);
    const row = await submissionRow(submissionId);
    expect(row).toMatchObject({ status: "approved", person_id: result.personId, decided_by: admin.id });

    // Deciding twice is refused.
    expect(await approveIntake(admin, submissionId)).toEqual({ ok: false, error: "admin.error.alreadyDecided" });
    expect(await countByEmail("walt@example.test")).toBe(1);
  });

  it("can show them in the staff directory; staff still never see their email or phone", async () => {
    const { submissionId } = await processIntake(
      base({ full_name: "Vera Visible", email: "vera@example.test", phone: "410-555-0123", skills: ["woodworking"] }),
      "en",
    );
    const result = await approveIntake(admin, submissionId, { showInDirectory: true });
    if (!result.ok) throw new Error(result.error);
    const seen = await getPerson(result.personId!, staff);
    expect(seen).toMatchObject({ full_name: "Vera Visible", directory_visible: true, contact_mode: "introduction", email: null, phone: null });
    const { people } = await searchPeople({ q: "woodworking" }, staff);
    expect(people.map((p) => p.id)).toContain(result.personId);
  });

  it("adds their referrer and suggestions only when approved", async () => {
    const known = await createPerson({ full_name: "Dee Known", email: "dee@example.test", status: "active" }, null);
    const rosa = await createPerson({ full_name: "Rosa Board", affiliations: ["board"], status: "active" }, null);
    const { submissionId } = await processIntake(
      base({
        full_name: "Sam Ortiz",
        email: "sam@example.test",
        referred_by: { name: "  rosa board ", email: null },
        referrals: [
          { name: "Lucía Gómez", phone: "410-555-0199", how_known: "my cousin", can_help_with: "runs a bakery", kind: "knows" },
          { name: "Dee K", email: "DEE@example.test", how_known: "coworker", kind: "knows" },
        ],
      }),
      "en",
    );
    expect((await query("SELECT 1 FROM people WHERE full_name = 'Lucía Gómez'")).length).toBe(0);

    const result = await approveIntake(admin, submissionId);
    if (!result.ok) throw new Error(result.error);
    const rels = await getRelationships(result.personId!, admin);
    expect(rels).toHaveLength(3);
    expect(rels.find((r) => r.kind === "referred")?.other.id).toBe(rosa);
    const lucia = rels.find((r) => r.other.full_name === "Lucía Gómez");
    expect(lucia?.note).toBe("my cousin");
    const lead = await getPerson(lucia!.other.id, admin);
    expect(lead).toMatchObject({ status: "lead", source: "referral", phone: "410-555-0199", directory_visible: false });
    expect(lead?.notes).toContain("runs a bakery");
    expect(rels.find((r) => r.other.id === known)?.note).toBe("coworker");
  });
});

describe("editing before approving", () => {
  it("stores the edits next to what was sent, and approval uses them", async () => {
    const payload = base({ full_name: "jon smth", email: "jon@example.test", contribution_types: ["other"], other_help: "Build benches" });
    const { submissionId } = await processIntake(payload, "en");
    const form = new FormData();
    for (const [k, v] of [
      ["full_name", "Jon Smith"],
      ["email", "Jon@Example.test"],
      ["organization", "Smith Woodworks"],
      ["skills", "carpentry, benches"],
      ["contribution_types", "skills_lesson"],
      ["contribution_types", "guest_speaker"],
      ["preferred_language", "en"],
    ])
      form.append(k, v);
    const edits = readIntakeEdits(form, payload);
    expect(edits.ok).toBe(true);
    if (!edits.ok) return;
    expect(edits.payload).toMatchObject({ full_name: "Jon Smith", email: "jon@example.test", skills: ["carpentry", "benches"], other_help: "Build benches" });
    expect((await saveIntakeEdits(admin, submissionId, edits.payload)).ok).toBe(true);

    const row = await submissionRow(submissionId);
    expect(row?.payload.full_name).toBe("jon smth");
    expect(row?.edited_payload?.full_name).toBe("Jon Smith");

    const result = await approveIntake(admin, submissionId);
    if (!result.ok) throw new Error(result.error);
    const person = await getPerson(result.personId!, admin);
    expect(person).toMatchObject({ full_name: "Jon Smith", organization_name: "Smith Woodworks", contribution_types: ["skills_lesson", "guest_speaker"] });

    const bad = new FormData();
    bad.append("email", "nope");
    expect(readIntakeEdits(bad, payload)).toEqual({ ok: false, errors: { full_name: "admin.error.nameRequired", email: "intake.error.emailInvalid" } });
  });
});

describe("rejecting a sign-up", () => {
  it("keeps a private note and creates no contact", async () => {
    const { submissionId } = await processIntake(base({ full_name: "Spam Bot", email: "spam@example.test" }), "en");
    expect(await rejectIntake(admin, submissionId, "  Looks like spam ")).toEqual({ ok: true, personId: null });
    expect(await submissionRow(submissionId)).toMatchObject({ status: "rejected", decision_note: "Looks like spam", person_id: null, decided_by: admin.id });
    expect(await countByEmail("spam@example.test")).toBe(0);
    expect(await approveIntake(admin, submissionId)).toEqual({ ok: false, error: "admin.error.alreadyDecided" });
    // A rejection can be reopened and then approved.
    expect(await setIntakeStatus(submissionId, "new", admin.id)).toBe(true);
    expect((await approveIntake(admin, submissionId)).ok).toBe(true);
    expect(await setIntakeStatus(submissionId, "archived", admin.id)).toBe(true);
    expect(await setIntakeStatus(submissionId, "new", admin.id)).toBe(false);
  });
});

describe("linking a sign-up to an existing record", () => {
  it("updates the matched person instead of creating a duplicate", async () => {
    const existing = await createPerson(
      {
        full_name: "Kendra Moss",
        email: "kendra@example.test",
        title: "Photographer",
        skills: ["photography"],
        contribution_types: ["skills_lesson"],
        status: "active",
        directory_visible: true,
        contact_mode: "direct",
      },
      null,
    );
    const { submissionId } = await processIntake(
      base({
        full_name: "Kendra Moss",
        email: "KENDRA@example.test",
        title: "Drone pilot",
        phone: "410-555-0144",
        skills: ["drone photography", "photography"],
        contribution_types: ["mentoring", "guest_speaker"],
        availability: "Wednesday afternoons",
      }),
      "en",
    );
    const result = await linkIntake(admin, submissionId, existing);
    expect(result).toEqual({ ok: true, personId: existing });
    expect(await countByEmail("kendra@example.test")).toBe(1);

    const person = await getPerson(existing, admin);
    expect(person?.title).toBe("Photographer");
    expect(person?.phone).toBe("410-555-0144");
    expect(person?.availability).toBe("Wednesday afternoons");
    expect(person?.skills.sort()).toEqual(["drone photography", "photography"]);
    expect(person?.contribution_types.sort()).toEqual(["guest_speaker", "mentoring", "skills_lesson"]);
    expect(person).toMatchObject({ directory_visible: true, contact_mode: "direct" });

    const kinds = (await listHistory(existing, admin)).map((h) => h.kind);
    expect(kinds).toContain("signup_submitted");
    expect(kinds).toContain("signup_approved");
    expect(kinds).not.toContain("contact_created");
    expect(await submissionRow(submissionId)).toMatchObject({ status: "approved", person_id: existing, matched_person_id: existing });
    expect(await linkIntake(admin, submissionId, existing)).toEqual({ ok: false, error: "admin.error.alreadyDecided" });
  });

  it("folds an older sign-up's own untouched contact into the matched record", async () => {
    const existing = await createPerson({ full_name: "Pat Lee", email: "pat@work.test", status: "active" }, null);
    const legacy = await createPerson({ full_name: "Pat Lee", email: "pat@home.test", source: "intake", skills: ["chess"] }, null);
    const friend = await createPerson({ full_name: "Friend Lead", status: "lead", source: "referral" }, null);
    await query("INSERT INTO relationships (id, person_id, related_person_id, kind, source) VALUES ($1,$2,$3,'knows','intake')", [
      newId(),
      legacy,
      friend,
    ]);
    const id = newId();
    await query("INSERT INTO intake_submissions (id, person_id, payload, locale) VALUES ($1,$2,$3,'en')", [
      id,
      legacy,
      JSON.stringify(base({ full_name: "Pat Lee", email: "pat@home.test", skills: ["chess"] })),
    ]);
    expect(await linkIntake(admin, id, existing)).toEqual({ ok: true, personId: existing });
    expect(await getPerson(legacy, admin)).toBeNull();
    expect((await getPerson(existing, admin))?.skills).toEqual(["chess"]);
    expect((await getRelationships(existing, admin)).map((r) => r.other.id)).toContain(friend);
  });

  it("refuses a record that doesn't exist", async () => {
    const { submissionId } = await processIntake(base({ email: "ghost@example.test" }), "en");
    expect(await linkIntake(admin, submissionId, "missing")).toEqual({ ok: false, error: "admin.error.personNotFound" });
    expect((await submissionRow(submissionId))?.status).toBe("new");
  });
});

describe("review is admin-only", () => {
  it("refuses staff in the server functions", async () => {
    const { submissionId } = await processIntake(base({ email: "staff-try@example.test" }), "en");
    for (const attempt of [
      () => approveIntake(staff, submissionId),
      () => linkIntake(staff, submissionId, "x"),
      () => rejectIntake(staff, submissionId, "no"),
      () => saveIntakeEdits(staff, submissionId, base()),
    ]) {
      const error = await attempt().then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(403);
    }
    expect((await submissionRow(submissionId))?.status).toBe("new");
  });

  it("gives staff a 403 on the queue, the detail page and its actions", async () => {
    const { submissionId } = await processIntake(base({ email: "staff-route@example.test" }), "en");
    const req = (cookie: string, init: RequestInit = {}) =>
      new Request(`http://localhost/app/admin/intake/${submissionId}`, { ...init, headers: { Cookie: cookie } });
    const statusOf = (promise: Promise<unknown>) =>
      promise.then(
        () => 200,
        (e: unknown) => (e instanceof Response ? e.status : 500),
      );
    const args = (request: Request) => ({ request, params: { submissionId }, context: {} }) as never;

    expect(await statusOf(queueLoader(args(req(staffCookie))))).toBe(403);
    expect(await statusOf(reviewLoader(args(req(staffCookie))))).toBe(403);
    const body = new URLSearchParams({ intent: "approve", show: "on" });
    expect(await statusOf(reviewAction(args(req(staffCookie, { method: "POST", body }))))).toBe(403);
    expect((await submissionRow(submissionId))?.status).toBe("new");

    // The same request from an admin approves it and moves on.
    const response = await reviewAction(args(req(adminCookie, { method: "POST", body: new URLSearchParams({ intent: "approve" }) })));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toContain("done=approved");
    const row = await submissionRow(submissionId);
    expect(row?.status).toBe("approved");
    expect((await getPerson(row!.person_id!, admin))?.directory_visible).toBe(false);
  });
});

function formOf(entries: [string, string][]): FormData {
  const form = new FormData();
  for (const [k, v] of entries) form.append(k, v);
  return form;
}

describe("validateIntake", () => {
  it("returns i18n keys for missing and invalid fields, ignoring unknown enum values", () => {
    const values = readIntakeForm(
      formOf([
        ["email", "not-an-email"],
        ["contribution_types", "hacking"],
        ["affiliations", "board"],
        ["ref_contact_1", "nope@"],
      ]),
    );
    expect(values.contribution_types).toEqual([]);
    expect(values.affiliations).toEqual([]);
    const result = validateIntake(values, "en");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toMatchObject({
      full_name: "intake.error.nameRequired",
      email: "intake.error.emailInvalid",
      organization: "intake.error.organizationRequired",
      contribution_types: "intake.error.contributionRequired",
      consent: "intake.error.consentRequired",
      "referrals.1.name": "intake.error.referralNameRequired",
      "referrals.1.contact": "intake.error.contactInvalid",
    });
  });

  it("builds a clean payload from a valid form", () => {
    const values = readIntakeForm(
      formOf([
        ["full_name", "  Ana Rivera "],
        ["email", "Ana@Example.test"],
        ["preferred_language", "both"],
        ["organization", " Rivera Tailoring "],
        ["contribution_types", "skills_lesson"],
        ["contribution_types", "other"],
        ["contribution_types", "cap_partner"],
        ["other_help", "Run a sewing club"],
        ["skills", "Sewing, quilting,, sewing"],
        ["cap_topics", "streams in the balance"],
        ["cap_topics_other", "Oysters"],
        ["affiliations", "alumni"],
        ["ref_name_0", "Lucía"],
        ["ref_contact_0", "(410) 555-0199"],
        ["referred_by_name", "Rosa"],
        ["consent", "on"],
      ]),
    );
    const result = validateIntake(values, "es");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      full_name: "Ana Rivera",
      email: "ana@example.test",
      preferred_language: "both",
      organization: "Rivera Tailoring",
      // Staff add CAP partners; the public form can't.
      contribution_types: ["skills_lesson", "other"],
      skills: ["sewing", "quilting"],
      other_help: "Run a sewing club",
      cap_topics: ["streams in the balance", "oysters"],
      affiliations: ["alumni"],
      referred_by: { name: "Rosa", email: null },
      referrals: [{ name: "Lucía", email: null, phone: "(410) 555-0199" }],
    });
  });

  it("asks what they have in mind when they pick Something else", () => {
    const values = readIntakeForm(
      formOf([
        ["full_name", "Ana"],
        ["email", "ana@example.test"],
        ["organization", "Independent"],
        ["contribution_types", "other"],
        ["skills", "ignored when no lesson is chosen"],
        ["consent", "on"],
      ]),
    );
    const result = validateIntake(values, "en");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({ other_help: "intake.error.otherRequired" });
  });
});

describe("spam guard", () => {
  it("detects the honeypot and rate-limits per IP", () => {
    expect(isHoneypotFilled(formOf([["website", "http://spam.test"]]))).toBe(true);
    expect(isHoneypotFilled(formOf([["website", ""]]))).toBe(false);

    const now = 1_000_000;
    for (let i = 0; i < RATE_MAX; i++) {
      expect(isIntakeRateLimited("203.0.113.9", now)).toBe(false);
      recordIntakeAttempt("203.0.113.9", now);
    }
    expect(isIntakeRateLimited("203.0.113.9", now)).toBe(true);
    expect(isIntakeRateLimited("198.51.100.1", now)).toBe(false);
    expect(isIntakeRateLimited("203.0.113.9", now + 61 * 60 * 1000)).toBe(false);
  });
});

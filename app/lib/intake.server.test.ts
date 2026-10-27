import { describe, expect, it } from "vitest";
import { query } from "./db.server";
import type { IntakePayload } from "./intake-types";
import {
  RATE_MAX,
  isHoneypotFilled,
  isIntakeRateLimited,
  processIntake,
  readIntakeForm,
  recordIntakeAttempt,
  validateIntake,
} from "./intake.server";
import { createPerson, getPerson, getRelationships } from "./people.server";

const ADMIN = { id: "test-admin", role: "admin" } as const;

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

describe("processIntake", () => {
  it("creates a new person and stores the submission as sent", async () => {
    const payload = base({ organization: "Rivera Tailoring", cap_topics: ["the bay"] });
    const { personId, submissionId } = await processIntake(payload, "es");

    const person = await getPerson(personId, ADMIN);
    expect(person).toMatchObject({
      full_name: "Ana Rivera",
      email: "ana@example.test",
      status: "new",
      source: "intake",
      preferred_language: "es",
      organization_name: "Rivera Tailoring",
      skills: ["sewing"],
      cap_topics: ["the bay"],
      contribution_types: ["skills_lesson"],
    });

    const [submission] = await query<{ person_id: string; locale: string; payload: IntakePayload; status: string }>(
      "SELECT person_id, locale, payload, status FROM intake_submissions WHERE id = $1",
      [submissionId],
    );
    expect(submission.person_id).toBe(personId);
    expect(submission.locale).toBe("es");
    expect(submission.status).toBe("new");
    expect(submission.payload.full_name).toBe("Ana Rivera");
  });

  it("merges into an existing person by email without overwriting what staff entered", async () => {
    const existingId = await createPerson(
      {
        full_name: "Marcus Bell",
        email: "Marcus@Example.test",
        title: "Head chef",
        skills: ["cooking"],
        contribution_types: ["classroom_volunteer"],
        status: "lead",
        source: "referral",
      },
      null,
    );

    const { personId } = await processIntake(
      base({
        full_name: "Marcus B.",
        email: "marcus@example.test",
        title: "Cook",
        phone: "410-555-0100",
        skills: ["knife skills", "cooking"],
        contribution_types: ["skills_lesson"],
        affiliations: ["community"],
      }),
      "en",
    );

    expect(personId).toBe(existingId);
    const person = await getPerson(existingId, ADMIN);
    expect(person?.full_name).toBe("Marcus Bell");
    expect(person?.title).toBe("Head chef");
    expect(person?.phone).toBe("410-555-0100");
    expect(person?.skills.sort()).toEqual(["cooking", "knife skills"]);
    expect(person?.contribution_types.sort()).toEqual(["classroom_volunteer", "skills_lesson"]);
    expect(person?.affiliations).toEqual(["community"]);
    expect(person?.source).toBe("referral");
    expect(person?.status).toBe("new");

    const [{ n }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM people WHERE lower(email) = 'marcus@example.test'");
    expect(n).toBe(1);
  });

  it("creates leads for referrals and links them with 'knows'", async () => {
    const known = await createPerson({ full_name: "Dee Known", email: "dee@example.test", status: "active" }, null);

    const { personId } = await processIntake(
      base({
        full_name: "Sam Ortiz",
        email: "sam@example.test",
        referrals: [
          { name: "Lucía Gómez", phone: "410-555-0199", how_known: "my cousin", can_help_with: "runs a bakery", kind: "knows" },
          { name: "Dee K", email: "DEE@example.test", how_known: "coworker", kind: "knows" },
        ],
      }),
      "en",
    );

    const rels = await getRelationships(personId, ADMIN);
    expect(rels).toHaveLength(2);
    expect(rels.every((r) => r.kind === "knows" && r.direction === "out" && r.source === "intake")).toBe(true);

    const lucia = rels.find((r) => r.other.full_name === "Lucía Gómez");
    expect(lucia?.note).toBe("my cousin");
    const lead = await getPerson(lucia!.other.id, ADMIN);
    expect(lead).toMatchObject({ status: "lead", source: "referral", phone: "410-555-0199", contribution_types: [] });
    expect(lead?.notes).toContain("runs a bakery");
    expect(lead?.notes).toContain("Sam Ortiz");

    // The second referral matched the existing person by email instead of creating a lead.
    expect(rels.find((r) => r.other.id === known)?.note).toBe("coworker");
    expect((await getPerson(known, ADMIN))?.status).toBe("active");
  });

  it("matches referred_by by name (case-insensitive) and records who referred whom", async () => {
    const rosa = await createPerson({ full_name: "Rosa Board", affiliations: ["board"], status: "active" }, null);

    const { personId } = await processIntake(
      base({ full_name: "Mei Chen", email: "mei@example.test", referred_by: { name: "  rosa board ", email: null } }),
      "en",
    );

    const rels = await getRelationships(rosa, ADMIN);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ kind: "referred", direction: "out", source: "intake" });
    expect(rels[0].other.id).toBe(personId);
  });

  it("creates a lead for an unknown referrer", async () => {
    const { personId } = await processIntake(
      base({ full_name: "Tom Lee", email: "tom@example.test", referred_by: { name: "Nobody Yet", email: "nobody@example.test" } }),
      "en",
    );
    const rels = await getRelationships(personId, ADMIN);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ kind: "referred", direction: "in" });
    const referrer = await getPerson(rels[0].other.id, ADMIN);
    expect(referrer).toMatchObject({ full_name: "Nobody Yet", email: "nobody@example.test", status: "lead", source: "referral" });
    expect(referrer?.notes).toContain("Tom Lee");
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

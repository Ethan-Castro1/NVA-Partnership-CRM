import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  parseCapPartnerForm,
  parseConnectionForm,
  parseDirectoryParams,
  parseEngagementForm,
  parsePersonForm,
  parseTargetId,
} from "./people-form.server";

function form(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("parsePersonForm", () => {
  it("parses a full form, normalizing tags and dropping unknown vocabulary", () => {
    const result = parsePersonForm(
      form([
        ["full_name", "  Rosa Delgado "],
        ["email", " Rosa@Example.COM "],
        ["phone", "410-555-0101"],
        ["preferred_language", "both"],
        ["organization_name", "Chesapeake Tailors"],
        ["organization_kind", "business"],
        ["title", "Owner"],
        ["contribution_types", "internship"],
        ["contribution_types", "skills_lesson"],
        ["contribution_types", "juggling"],
        ["affiliations", "board"],
        ["affiliations", "nope"],
        ["skills", "Sewing, quilting;  sewing ,"],
        ["cap_topics", "The Bay, housing"],
        ["availability", ""],
        ["bio", "Loves teaching."],
        ["status", "active"],
        ["notes", "   "],
        ["source", "import"],
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      full_name: "Rosa Delgado",
      email: "rosa@example.com",
      phone: "410-555-0101",
      preferred_language: "both",
      organization_name: "Chesapeake Tailors",
      organization_kind: "business",
      title: "Owner",
      contribution_types: ["skills_lesson", "internship"],
      affiliations: ["board"],
      skills: ["sewing", "quilting"],
      cap_topics: ["the bay", "housing"],
      availability: null,
      bio: "Loves teaching.",
      status: "active",
      notes: null,
      funding_focus: null,
    });
    expect("source" in result.input).toBe(false);
  });

  it("falls back to defaults for missing or unknown enum values", () => {
    const result = parsePersonForm(
      form([
        ["full_name", "Mei"],
        ["preferred_language", "fr"],
        ["organization_kind", "castle"],
        ["status", "deleted"],
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.preferred_language).toBe("en");
    expect(result.input.organization_kind).toBe("other");
    expect(result.input.status).toBe("new");
    expect(result.input.email).toBeNull();
    expect(result.input.skills).toEqual([]);
  });

  it("returns i18n keys per field", () => {
    const result = parsePersonForm(
      form([
        ["full_name", "   "],
        ["email", "not-an-email"],
        ["title", "x".repeat(201)],
      ]),
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        full_name: "people.form.errorNameRequired",
        email: "people.form.errorEmail",
        title: "people.form.errorTooLong",
      },
    });
  });

  it("caps the number of tags", () => {
    const many = Array.from({ length: 60 }, (_, i) => `skill ${i}`).join(",");
    const result = parsePersonForm(form([["full_name", "Al"], ["skills", many]]));
    expect(result.ok && result.input.skills).toHaveLength(40);
  });
});

describe("profile forms", () => {
  it("parses log activity, defaulting the date and CAP", () => {
    expect(parseEngagementForm(form([["kind", "lesson"], ["notes", " Great day "], ["cap_id", "none"]]))).toEqual({
      ok: true,
      value: { kind: "lesson", happenedOn: null, notes: "Great day", capId: null },
    });
    expect(parseEngagementForm(form([["kind", "call"], ["happened_on", "2026-09-30"], ["cap_id", "cap-1"]]))).toEqual({
      ok: true,
      value: { kind: "call", happenedOn: "2026-09-30", notes: null, capId: "cap-1" },
    });
  });

  it("rejects an unknown kind and an impossible date", () => {
    expect(parseEngagementForm(form([["kind", "party"], ["happened_on", "2026-02-31"]]))).toEqual({
      ok: false,
      errors: { kind: "people.error.kind", happened_on: "people.error.date" },
    });
  });

  it("parses add connection and add to CAP", () => {
    expect(parseConnectionForm(form([["related_person_id", "p2"], ["kind", "referred"], ["note", ""]]))).toEqual({
      ok: true,
      value: { relatedPersonId: "p2", kind: "referred", note: null },
    });
    expect(parseConnectionForm(form([["kind", "enemy"]]))).toEqual({
      ok: false,
      errors: { related_person_id: "people.error.person", kind: "people.error.relKind" },
    });
    expect(parseCapPartnerForm(form([["cap_id", "c1"], ["role", " Guest expert "]]))).toEqual({
      ok: true,
      value: { capId: "c1", role: "Guest expert" },
    });
    expect(parseCapPartnerForm(form([["role", "x".repeat(201)]]))).toEqual({
      ok: false,
      errors: { cap_id: "people.error.cap", role: "people.error.tooLong" },
    });
    expect(parseTargetId(form([["target_id", "abc"]]))).toBe("abc");
    expect(parseTargetId(form([]))).toBeNull();
  });
});

describe("parseDirectoryParams", () => {
  it("defaults to everyone except inactive, page 1", () => {
    const { params, filter } = parseDirectoryParams(new URLSearchParams(""));
    expect(params).toEqual({ q: "", types: [], aff: "", status: "", spanish: false, topic: "", page: 1 });
    expect(filter).toMatchObject({ includeInactive: false, limit: PAGE_SIZE, offset: 0 });
    expect(filter.statuses).toBeUndefined();
  });

  it("reads every filter and ignores unknown values", () => {
    const { params, filter } = parseDirectoryParams(
      new URLSearchParams("q=sewing&type=internship&type=bogus&type=cap_partner&aff=board&status=lead&lang=es&topic=The%20Bay&page=3"),
    );
    expect(params).toEqual({
      q: "sewing",
      types: ["internship", "cap_partner"],
      aff: "board",
      status: "lead",
      spanish: true,
      topic: "the bay",
      page: 3,
    });
    expect(filter).toMatchObject({
      q: "sewing",
      contributionTypes: ["internship", "cap_partner"],
      affiliations: ["board"],
      statuses: ["lead"],
      language: "es",
      capTopics: ["the bay"],
      offset: 2 * PAGE_SIZE,
    });
  });

  it("handles status=all and junk pages", () => {
    const { params, filter } = parseDirectoryParams(new URLSearchParams("status=all&aff=king&page=-4"));
    expect(params.status).toBe("all");
    expect(params.aff).toBe("");
    expect(params.page).toBe(1);
    expect(filter.includeInactive).toBe(true);
    expect(parseDirectoryParams(new URLSearchParams("page=abc")).params.page).toBe(1);
  });
});

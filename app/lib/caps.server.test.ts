import { describe, expect, it } from "vitest";
import { createUser } from "./auth.server";
import { addCapPartner, canEditCap, capSearchText, createCap, getCap, getCapSuggestions, parseCapForm, parsePartnerUpdate } from "./caps.server";
import { addRelationship, createPerson } from "./people.server";

function form(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("canEditCap", () => {
  it("lets the owner and admins edit, nobody else", () => {
    const cap = { owner_id: "u1" };
    expect(canEditCap(cap, { id: "u1", role: "teacher" })).toBe(true);
    expect(canEditCap(cap, { id: "u2", role: "teacher" })).toBe(false);
    expect(canEditCap(cap, { id: "u2", role: "admin" })).toBe(true);
    expect(canEditCap({ owner_id: null }, { id: "u2", role: "teacher" })).toBe(false);
  });
});

describe("parseCapForm", () => {
  it("merges topic pills with typed topics and ignores unknown statuses", () => {
    const result = parseCapForm(
      form([
        ["title", "  Clean Creek "],
        ["topics", "the bay"],
        ["topics", "environment"],
        ["topics_other", "Oysters, the bay; stormwater"],
        ["status", "bogus"],
        ["needs", ""],
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ title: "Clean Creek", status: "planning", needs: null });
    expect(result.value.topics).toEqual(["the bay", "environment", "oysters", "stormwater"]);
  });

  it("returns i18n keys for missing titles, long fields and too many topics", () => {
    const result = parseCapForm(
      form([
        ["title", ""],
        ["term", "x".repeat(61)],
        ["topics_other", Array.from({ length: 13 }, (_, i) => `t${i}`).join(",")],
      ]),
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "caps.form.error.titleRequired",
        term: "caps.form.error.tooLong",
        topics: "caps.form.error.tooManyTopics",
      },
    });
  });

  it("validates inline partner updates", () => {
    expect(parsePartnerUpdate(form([["personId", "p"], ["status", "confirmed"], ["role", " Judge "]]))).toEqual({
      personId: "p",
      status: "confirmed",
      role: "Judge",
      note: "",
    });
    expect(parsePartnerUpdate(form([["personId", "p"], ["status", "hacked"]]))).toBeNull();
  });
});

describe("getCapSuggestions", () => {
  it("suggests matching people with intro paths, leaving out current partners", async () => {
    const owner = await createUser({ email: "owner@test", name: "Owner", password: "long-enough-pw", role: "teacher" });
    const board = await createPerson({ full_name: "Bea Board", affiliations: ["board"] }, null);
    const oyster = await createPerson({ full_name: "Olu Oyster", skills: ["water testing"], cap_topics: ["the bay"] }, null);
    const already = await createPerson({ full_name: "Al Ready", cap_topics: ["the bay"] }, null);
    await createPerson({ full_name: "Unrelated", skills: ["knitting"] }, null);
    await addRelationship({ personId: board, relatedPersonId: oyster, kind: "knows" }, null);

    const capId = await createCap({ title: "Bay CAP", topics: ["the bay"], needs: "water testing" }, owner);
    await addCapPartner({ capId, personId: already }, owner);
    const cap = (await getCap(capId))!;
    expect(capSearchText(cap)).toBe("water testing, the bay");

    const suggestions = await getCapSuggestions(cap);
    expect(suggestions.map((s) => s.person.full_name)).toEqual(["Olu Oyster"]);
    expect(suggestions[0].matched.sort()).toEqual(["the bay", "water testing"]);
    expect(suggestions[0].paths[0].chain[0].full_name).toBe("Bea Board");

    expect(await getCapSuggestions({ id: capId, needs: null, topics: [] })).toEqual([]);
  });
});

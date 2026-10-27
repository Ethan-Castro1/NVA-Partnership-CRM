import { beforeAll, describe, expect, it } from "vitest";
import { addRelationship, createPerson } from "~/lib/people.server";
import type { SessionUser } from "~/lib/types";
import { fallbackAnswer, interpretQuestion, peopleForCards, referencedPersonIds, runAssistant } from "./assistant.server";

// An admin sees everyone; staff scoping is tested in permissions.server.test.ts.
const user: SessionUser = { id: "u1", email: "t@nva.test", name: "Tess Teacher", role: "admin", locale: "en" };
let rosa: string, lucia: string, mei: string, tom: string;

beforeAll(async () => {
  rosa = await createPerson({ full_name: "Rosa Delgado", affiliations: ["board"], status: "active" }, null);
  lucia = await createPerson({ full_name: "Lucía Herrera", skills: ["tailoring"], status: "active" }, null);
  mei = await createPerson(
    { full_name: "Mei Lin", skills: ["sewing", "embroidery"], contribution_types: ["skills_lesson"], status: "lead", title: "Textile artist" },
    null,
  );
  tom = await createPerson(
    { full_name: "Tom Brennan", skills: ["welding"], cap_topics: ["the bay"], contribution_types: ["internship"], status: "active" },
    null,
  );
  await addRelationship({ personId: rosa, relatedPersonId: lucia, kind: "knows" }, null);
  await addRelationship({ personId: lucia, relatedPersonId: mei, kind: "colleague" }, null);
});

describe("interpretQuestion", () => {
  it("pulls out ways to help and maps common Spanish words", () => {
    expect(interpretQuestion("Who could host a welding internship?").contributionTypes).toEqual(["internship"]);
    const es = interpretQuestion("¿Quién puede dar una lección de costura?");
    expect(es.contributionTypes).toEqual(["skills_lesson"]);
    expect(es.q).toContain("sewing");
    expect(interpretQuestion("someone who speaks Spanish").spanish).toBe(true);
  });
});

describe("the no-API-key fallback", () => {
  it("runAssistant answers from the database when AI isn't configured", async () => {
    const result = await runAssistant({
      messages: [{ role: "user", content: "Who can teach a sewing lesson?" }],
      locale: "en",
      user,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("fallback");
    expect(result.personIds).toEqual([mei]);
    expect(result.answer).toContain(`Here's who matches "Who can teach a sewing lesson?" in our records:`);
    expect(result.answer).toContain(`[Mei Lin](/app/people/${mei})`);
    expect(result.answer).toContain("Rosa Delgado (Board member) knows Lucía Herrera, who knows Mei Lin");
    expect(result.answer).toContain("Lead, not contacted yet.");
    expect(result.answer).not.toContain("—");
  });

  it("answers in Spanish and finds people from Spanish words", async () => {
    const { answer, personIds } = await fallbackAnswer("¿Quién podría ofrecer una pasantía de soldadura?", "es", user);
    expect(personIds).toEqual([tom]);
    expect(answer).toContain("Esto es lo que encontré");
    expect(answer).toContain("Todavía no hay un camino conocido");
  });

  it("drops a too-strict type filter before giving up", async () => {
    const { personIds } = await fallbackAnswer("Partners for a CAP about the Chesapeake Bay", "en", user);
    expect(personIds).toEqual([tom]);
  });

  it("says clearly when nobody matches and suggests next steps", async () => {
    const { answer, personIds } = await fallbackAnswer("glassblowing", "en", user);
    expect(personIds).toEqual([]);
    expect(answer).toContain(`I couldn't find anyone matching "glassblowing"`);
    expect(answer).toContain("[Connections](/app/connections)");
  });

  it("asks for a keyword when the question has none", async () => {
    const { answer } = await fallbackAnswer("Who can help?", "en", user);
    expect(answer).toContain("Tell me a skill");
  });

  it("uses the last user message", async () => {
    const result = await runAssistant({
      messages: [
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "sewing" },
        { role: "assistant", content: "..." },
        { role: "user", content: "welding" },
      ],
      locale: "en",
      user,
    });
    expect(result.ok && result.personIds).toEqual([tom]);
  });
});

describe("helpers", () => {
  it("finds person links in an answer, in order and once each", () => {
    expect(referencedPersonIds("[A](/app/people/a-1) and [B](/app/people/b-2), again [A](/app/people/a-1)")).toEqual([
      "a-1",
      "b-2",
    ]);
  });

  it("builds cards in the order asked and skips unknown ids", async () => {
    const cards = await peopleForCards([tom, "missing", mei], user);
    expect(cards.map((c) => c.full_name)).toEqual(["Tom Brennan", "Mei Lin"]);
  });
});

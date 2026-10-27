import { beforeAll, describe, expect, it } from "vitest";
import { addRelationship, createPerson, searchPeople } from "~/lib/people.server";
import type { SessionUser } from "~/lib/types";
import { fallbackAnswer, interpretQuestion, peopleForCards, referencedPersonIds, runAssistant, webLeadsClosing } from "./assistant.server";

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
    // Mei teaches sewing; Lucía's tailoring is a related word, ranked lower (same as People & Skills).
    expect(result.personIds).toEqual([mei, lucia]);
    // One short line; the people show as cards, so the text doesn't list them or repeat the question.
    expect(result.answer).toBe("2 people match.");
    expect(result.reasons?.[mei]?.length).toBeGreaterThan(0);
  });

  it("answers in Spanish and finds people from Spanish words", async () => {
    const { answer, personIds } = await fallbackAnswer("¿Quién podría ofrecer una pasantía de soldadura?", "es", user);
    expect(personIds).toEqual([tom]);
    expect(answer).toBe("1 persona coincide.");
  });

  it("finds the same people, in the same order, as the People & Skills search", async () => {
    for (const question of ["Who can teach a sewing lesson?", "someone to host a welding internship", "Who speaks Spanish and can teach tailoring?"]) {
      const { personIds } = await fallbackAnswer(question, "en", user);
      const spanish = /spanish/i.test(question);
      const { people } = await searchPeople(
        { q: spanish ? question.replace(/spanish/gi, " ") : question, language: spanish ? "es" : undefined, limit: 6 },
        user,
      );
      expect(personIds).toEqual(people.map((p) => p.id));
    }
  });

  it("drops a too-strict type filter before giving up", async () => {
    const { personIds } = await fallbackAnswer("Partners for a CAP about the Chesapeake Bay", "en", user);
    expect(personIds).toEqual([tom]);
  });

  it("says clearly when nobody matches and suggests next steps", async () => {
    const { answer, personIds } = await fallbackAnswer("glassblowing", "en", user);
    expect(personIds).toEqual([]);
    expect(answer).toContain("Nobody in our records matched that.");
    expect(answer).not.toContain("glassblowing");
    expect(answer).toContain("[People](/app/people)");
    // Web search isn't set up in tests, so the answer doesn't point to it.
    expect(answer).not.toMatch(/web|Connections/);
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

describe("web finds in an answer", () => {
  it("end with a link to the web leads in Connections, in the page language", () => {
    expect(webLeadsClosing("Two leads from the web.", "beekeeping club", "en")).toBe(
      "[See web leads in Connections](/app/connections?q=beekeeping%20club)",
    );
    expect(webLeadsClosing("Dos contactos.", "apicultura", "es")).toBe("[Ver contactos de la web en Conexiones](/app/connections?q=apicultura)");
    // No web search, or the answer already links there: nothing to add.
    expect(webLeadsClosing("Nobody.", null, "en")).toBeUndefined();
    expect(webLeadsClosing("See [Connections](/app/connections?q=bees).", "bees", "en")).toBeUndefined();
  });
});

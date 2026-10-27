import { describe, expect, it } from "vitest";
import { explainMatch, hasSearchIntent, matchTerms, parseSearch, type ExplainInput } from "./search-language";

const termsOf = (q: string) => matchTerms(parseSearch(q)).map((t) => t.term);

describe("parseSearch: the staff dashboard examples", () => {
  it("Find someone to teach students basic carpentry", () => {
    const p = parseSearch("Find someone to teach students basic carpentry.");
    expect(p.terms).toEqual(["carpentry"]);
    expect(p.related).toEqual(expect.arrayContaining(["woodwork", "construction"]));
    expect(p.contributionTypes).toEqual(["skills_lesson"]);
    expect(p.categories).toEqual(["skills_instructor"]);
    // Filler words never become search terms.
    for (const word of ["find", "someone", "teach", "students", "basic"]) expect(p.terms).not.toContain(word);
  });

  it("Find a guest speaker who works in healthcare", () => {
    const p = parseSearch("Find a guest speaker who works in healthcare.");
    expect(p.terms).toEqual(["healthcare"]);
    expect(p.related).toEqual(expect.arrayContaining(["health", "nurs", "medic", "hospital"]));
    expect(p.contributionTypes).toEqual(["guest_speaker"]);
    expect(p.categories).toEqual(["guest_speaker"]);
  });

  it("Find volunteers for an upcoming school event", () => {
    const p = parseSearch("Find volunteers for an upcoming school event.");
    expect(p.terms).toEqual([]);
    expect(p.contributionTypes).toEqual(["classroom_volunteer"]);
    expect(p.categories).toEqual(["volunteer"]);
    expect(hasSearchIntent(p)).toBe(true);
  });

  it("Find a community organization that supports environmental education", () => {
    const p = parseSearch("Find a community organization that supports environmental education.");
    expect(p.terms).toEqual(["environmental"]);
    expect(p.related).toEqual(expect.arrayContaining(["environment", "watershed", "oyster", "water"]));
    expect(p.categories).toEqual(["community_org"]);
    expect(p.contributionTypes).toEqual([]);
    // "environmental" is covered by "environment", which keeps the stronger tier.
    expect(matchTerms(p)[0]).toEqual({ term: "environment", tier: "core" });
  });

  it("Find someone who could host students for internships", () => {
    const p = parseSearch("Find someone who could host students for internships.");
    expect(p.terms).toEqual([]);
    expect(p.contributionTypes).toEqual(["internship"]);
    expect(p.categories).toEqual(["internship_host"]);
    expect(p.hints).toEqual(["intern"]);
  });

  it("I need someone who can teach students about financial literacy", () => {
    const p = parseSearch("I need someone who can teach students about financial literacy");
    expect(p.terms).toEqual(["financial literacy"]);
    expect(p.related).toEqual(expect.arrayContaining(["bank", "budget", "credit", "bookkeep"]));
    expect(p.contributionTypes).toEqual(["skills_lesson"]);
    // The phrase stays whole: "literacy" alone would find a media literacy librarian.
    expect(termsOf("I need someone who can teach students about financial literacy")).not.toContain("literacy");
  });
});

describe("parseSearch: other questions", () => {
  it("keeps plain words, drops stopwords in both languages and de-pluralizes", () => {
    expect(parseSearch("welders").terms).toEqual(["welder"]);
    expect(parseSearch("someone who knows robotics and drones").terms).toEqual(["robotic", "drone"]);
    expect(parseSearch("busco alguien para coser").terms).toEqual(["coser"]);
    expect(parseSearch("busco alguien para coser").related).toContain("sew");
  });

  it("reads Spanish questions", () => {
    const p = parseSearch("Busco a alguien que enseñe carpintería a los estudiantes");
    expect(p.terms).toEqual(["carpintería"]);
    expect(p.contributionTypes).toEqual(["skills_lesson"]);
    expect(p.related).toContain("carpent");
    expect(parseSearch("voluntarios para un evento").contributionTypes).toEqual(["classroom_volunteer"]);
    expect(parseSearch("una organización de medio ambiente").categories).toEqual(["community_org"]);
    expect(parseSearch("una organización de medio ambiente").terms).toEqual(["medio ambiente"]);
  });

  it("prefers the longest phrase", () => {
    // "public speaking" is a skill, not a request for a guest speaker.
    const speaking = parseSearch("public speaking coach");
    expect(speaking.terms).toEqual(["public speaking", "coach"]);
    expect(speaking.contributionTypes).toEqual([]);
    // "grant writing" is a skill, not a funder.
    expect(parseSearch("grant writing").contributionTypes).toEqual([]);
    expect(parseSearch("grant writing").terms).toEqual(["grant writing"]);
    expect(parseSearch("mental health counselor").terms).toEqual(["mental health", "counselor"]);
  });

  it("keeps mentoring as a word and a kind of help", () => {
    const p = parseSearch("a mentor for two students");
    expect(p.terms).toEqual(["mentor", "two"]);
    expect(p.contributionTypes).toEqual(["mentoring"]);
  });

  it("knows other kinds of help", () => {
    expect(parseSearch("after-school robotics club").contributionTypes).toEqual(["after_school"]);
    expect(parseSearch("a CAP partner for the bay").contributionTypes).toEqual(["cap_partner"]);
    expect(parseSearch("local businesses that fund field trips").categories).toEqual(
      expect.arrayContaining(["business", "funder", "volunteer"]),
    );
    expect(parseSearch("someone at the city government").categories).toEqual(["government"]);
  });

  it("handles empty and filler-only questions", () => {
    expect(parseSearch("")).toEqual({ terms: [], related: [], hints: [], contributionTypes: [], categories: [] });
    expect(parseSearch(undefined).terms).toEqual([]);
    expect(hasSearchIntent(parseSearch("find someone who can help"))).toBe(false);
  });

  it("caps the number of words", () => {
    const p = parseSearch("alpha bravo charlie delta echo foxtrot golf hotel india juliet");
    expect(p.terms).toHaveLength(8);
  });
});

describe("matchTerms", () => {
  it("drops words a shorter word already finds, keeping the strongest tier", () => {
    const terms = matchTerms(parseSearch("sewing"));
    expect(terms.find((t) => t.term === "sew")).toEqual({ term: "sew", tier: "core" });
    expect(terms.map((t) => t.term)).not.toContain("sewing");
    for (const a of terms) for (const b of terms) if (a !== b) expect(a.term.includes(b.term)).toBe(false);
  });

  it("lists typed words first, then related words, then hints", () => {
    const tiers = matchTerms(parseSearch("teach carpentry")).map((t) => t.tier);
    expect(tiers[0]).toBe("core");
    expect(tiers.at(-1)).toBe("hint");
    expect([...tiers].sort((a, b) => ["core", "related", "hint"].indexOf(a) - ["core", "related", "hint"].indexOf(b))).toEqual(tiers);
  });
});

describe("explainMatch", () => {
  const banker: ExplainInput = {
    skills: ["bookkeeping", "budgeting", "tutoring"],
    cap_topics: [],
    contribution_types: ["skills_lesson", "classroom_volunteer"],
    categories: ["skills_instructor", "volunteer"],
    title: "Bookkeeper",
    organization_name: null,
    bio: null,
    shared_summary: "Bookkeeper and parent. Can teach budgeting and banking basics.",
    availability: "Monday mornings",
    location: "Parole",
  };

  it("explains a financial literacy match the way the requirements describe", () => {
    const reasons = explainMatch(banker, parseSearch("I need someone who can teach students about financial literacy"));
    expect(reasons).toEqual([
      { kind: "skill", value: "bookkeeping" },
      { kind: "skill", value: "budgeting" },
      { kind: "offers", value: "skills_lesson" },
      { kind: "bio", value: "banking" },
    ]);
  });

  it("uses private notes only when they are passed (admins)", () => {
    const q = parseSearch("launchpad");
    expect(explainMatch(banker, q)).toEqual([]);
    expect(explainMatch({ ...banker, private: "Met at the Launchpad Innovation Center." }, q)).toEqual([
      { kind: "notes", value: "launchpad" },
    ]);
  });

  it("names CAPs, titles, organizations, availability and location", () => {
    const sam: ExplainInput = {
      skills: ["marine biology", "water testing"],
      cap_topics: ["streams in the balance"],
      contribution_types: ["cap_partner"],
      categories: ["cap_partner", "community_org"],
      title: "Restoration program lead",
      organization_name: "Severn Oyster Collective (demo)",
      availability: "Fridays",
      location: "Annapolis",
    };
    expect(explainMatch(sam, parseSearch("community organization for environmental education"))).toEqual([
      { kind: "skill", value: "marine biology" },
      { kind: "skill", value: "water testing" },
      { kind: "cap", value: "streams in the balance" },
      { kind: "title", value: "Restoration program lead" },
      { kind: "organization", value: "Severn Oyster Collective (demo)" },
    ]);
    expect(explainMatch(sam, parseSearch("someone in Annapolis free on fridays"))).toEqual([
      { kind: "availability", value: "Fridays" },
      { kind: "location", value: "Annapolis" },
    ]);
  });

  it("explains a filter on ways to help", () => {
    expect(explainMatch(banker, parseSearch(""), ["classroom_volunteer"])).toEqual([{ kind: "offers", value: "classroom_volunteer" }]);
  });
});

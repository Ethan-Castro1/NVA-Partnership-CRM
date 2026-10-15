import { describe, expect, it } from "vitest";
import { addRelationship, createPerson, findIntroPaths, searchPeople, searchTerms } from "./people.server";

describe("searchTerms", () => {
  it("drops stopwords in both languages and de-pluralizes", () => {
    expect(searchTerms("I need someone who can teach sewing")).toEqual(["sewing"]);
    expect(searchTerms("busco alguien para coser")).toEqual(["coser"]);
    expect(searchTerms("welders")).toEqual(["welder"]);
  });
});

describe("search and the connection finder", () => {
  it("ranks skill matches and finds second-degree paths from the board", async () => {
    const board = await createPerson({ full_name: "Bea Board", affiliations: ["board"] }, null);
    const mid = await createPerson({ full_name: "Mo Middle", skills: ["cooking"] }, null);
    const target = await createPerson({ full_name: "Sue Sewer", skills: ["Sewing", "quilting"] }, null);
    await addRelationship({ personId: board, relatedPersonId: mid, kind: "knows" }, null);
    await addRelationship({ personId: mid, relatedPersonId: target, kind: "colleague" }, null);

    const { people, total } = await searchPeople({ q: "sewing teacher" });
    expect(total).toBe(1);
    expect(people[0].id).toBe(target);
    expect(people[0].matched).toEqual(["sewing"]);

    const paths = await findIntroPaths(target);
    expect(paths).toHaveLength(1);
    expect(paths[0].degree).toBe(2);
    expect(paths[0].chain.map((p) => p.full_name)).toEqual(["Bea Board", "Mo Middle", "Sue Sewer"]);
  });
});

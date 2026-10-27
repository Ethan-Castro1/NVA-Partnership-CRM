import { beforeAll, describe, expect, it } from "vitest";
import { findDuplicates, normalizeName, phoneKey } from "./duplicates.server";
import { createPerson } from "./people.server";

let jose: string, joseOther: string, rosa: string, phoneOnly: string;

beforeAll(async () => {
  jose = await createPerson(
    { full_name: "José  Pérez", email: "Jose.Perez@Example.org", phone: "(410) 555-0101", organization_name: "Bay Builders" },
    null,
  );
  joseOther = await createPerson({ full_name: "Jose Perez", organization_name: "Somewhere Else" }, null);
  rosa = await createPerson({ full_name: "Rosa Delgado", email: "rosa@example.org" }, null);
  phoneOnly = await createPerson({ full_name: "Phone Person", phone: "+1 410-555-0199" }, null);
});

describe("normalizing", () => {
  it("folds accents, case, spaces and punctuation in names, and keeps the last 10 phone digits", () => {
    expect(normalizeName("  José   Pérez-Ruiz ")).toBe("jose perez ruiz");
    expect(phoneKey("+1 (410) 555-0101")).toBe("4105550101");
    expect(phoneKey("410.555.0101")).toBe("4105550101");
    expect(phoneKey("555")).toBe("");
  });
});

describe("findDuplicates", () => {
  it("ranks the same email first, then name and organization, then name only", async () => {
    const found = await findDuplicates({ full_name: "jose perez", email: "jose.perez@example.org", organization_name: "bay builders" });
    expect(found.map((c) => c.id)).toEqual([jose, joseOther]);
    expect(found[0].reasons).toEqual(["email", "name_org"]);
    expect(found[0].score).toBe(140);
    expect(found[1].reasons).toEqual(["name"]);
  });

  it("matches phone numbers written differently", async () => {
    const found = await findDuplicates({ full_name: "Someone New", phone: "410 555 0199" });
    expect(found.map((c) => c.id)).toEqual([phoneOnly]);
    expect(found[0].reasons).toEqual(["phone"]);
  });

  it("finds an email match even when the name is different", async () => {
    const found = await findDuplicates({ full_name: "R. Delgado", email: " ROSA@example.org " });
    expect(found.map((c) => c.id)).toEqual([rosa]);
    expect(found[0].reasons).toEqual(["email"]);
  });

  it("can leave out the record being edited, and returns nothing for nothing", async () => {
    const found = await findDuplicates({ full_name: "José Pérez", email: "jose.perez@example.org" }, { excludeId: jose });
    expect(found.map((c) => c.id)).toEqual([joseOther]);
    expect(await findDuplicates({ full_name: "Nobody Here", email: "nobody@example.org" })).toEqual([]);
    expect(await findDuplicates({})).toEqual([]);
  });

  it("returns hidden records too (it is admin-only)", async () => {
    const found = await findDuplicates({ email: "rosa@example.org" });
    expect(found[0]).toMatchObject({ id: rosa, directory_visible: false });
  });
});

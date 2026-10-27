/**
 * The staff dashboard's example searches against the real demo seed: each one
 * should put sensible people first and say why, for staff and for admins.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { query } from "./db.server";
import { seedDemoData } from "./demo-seed.server";
import { createPerson, searchPeople, type SearchHit } from "./people.server";
import type { Viewer } from "./permissions.server";

let staff: Viewer;
let admin: Viewer;
const userId = async (email: string) => (await query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]))[0].id;

beforeAll(async () => {
  await seedDemoData();
  staff = { id: await userId("teacher@nva.test"), role: "staff" };
  admin = { id: await userId("admin@nva.test"), role: "admin" };
}, 60000);

const names = (people: SearchHit[]) => people.map((p) => p.full_name);
const reasonsOf = (people: SearchHit[], name: string) => people.find((p) => p.full_name === name)?.reasons ?? [];
const search = async (q: string, viewer: Viewer) => (await searchPeople({ q, limit: 10 }, viewer)).people;

describe("example searches on the demo data", () => {
  it("basic carpentry finds the carpenter, who teaches practical skills", async () => {
    const people = await search("Find someone to teach students basic carpentry.", staff);
    expect(names(people)).toEqual(["Luis Romero"]);
    expect(people[0].reasons).toEqual(
      expect.arrayContaining([
        { kind: "skill", value: "carpentry" },
        { kind: "skill", value: "woodworking" },
        { kind: "offers", value: "skills_lesson" },
      ]),
    );
    expect(people[0].matched).toContain("carpentry");
  });

  it("a healthcare guest speaker finds the pediatrician and the retired nurse", async () => {
    const people = await search("Find a guest speaker who works in healthcare.", staff);
    expect(names(people)).toEqual(["Dr. Helen Cho", "Denise Okafor"]);
    expect(reasonsOf(people, "Dr. Helen Cho")).toEqual(expect.arrayContaining([{ kind: "skill", value: "medicine" }]));
    expect(reasonsOf(people, "Denise Okafor")).toEqual(expect.arrayContaining([{ kind: "skill", value: "nursing" }]));
    // Hidden leads are admin-only.
    expect(names(await search("Find a guest speaker who works in healthcare.", admin))).toContain("Paul Avery");
  });

  it("volunteers for a school event finds school volunteers only", async () => {
    const { people, total } = await searchPeople({ q: "Find volunteers for an upcoming school event.", limit: 50 }, staff);
    expect(total).toBeGreaterThanOrEqual(6);
    for (const person of people) {
      expect(person.contribution_types).toContain("classroom_volunteer");
      expect(person.reasons).toContainEqual({ kind: "offers", value: "classroom_volunteer" });
    }
    expect(names(people)).toEqual(expect.arrayContaining(["Lucía Herrera", "Sam Whitaker", "Tasha Greene"]));
  });

  it("an environmental education organization finds the oyster collective and the garden first", async () => {
    const people = await search("Find a community organization that supports environmental education.", staff);
    expect(names(people).slice(0, 2)).toEqual(["Sam Whitaker", "Naomi Fields"]);
    expect(reasonsOf(people, "Sam Whitaker")).toEqual(
      expect.arrayContaining([{ kind: "organization", value: "Severn Oyster Collective (demo)" }]),
    );
    expect(reasonsOf(people, "Naomi Fields")).toEqual(expect.arrayContaining([{ kind: "skill", value: "gardening" }]));
  });

  it("hosting interns finds internship hosts, the one who says he can host first", async () => {
    const { people, total } = await searchPeople({ q: "Find someone who could host students for internships.", limit: 50 }, staff);
    expect(people[0].full_name).toBe("Tom Brennan");
    expect(people[0].reasons).toEqual([
      { kind: "offers", value: "internship" },
      { kind: "availability", value: "Can host 2 interns on Fridays" },
    ]);
    expect(total).toBe(people.length);
    for (const person of people) expect(person.contribution_types).toContain("internship");
  });

  it("financial literacy finds the bookkeeper with banking basics, then the bakery owner who teaches", async () => {
    const people = await search("I need someone who can teach students about financial literacy", staff);
    expect(names(people)).toEqual(["Tasha Greene", "Rosa Delgado"]);
    expect(people[0].reasons).toEqual([
      { kind: "skill", value: "bookkeeping" },
      { kind: "skill", value: "budgeting" },
      { kind: "bio", value: "banking" },
    ]);
    expect(people[1].reasons).toEqual([
      { kind: "skill", value: "bookkeeping" },
      { kind: "offers", value: "skills_lesson" },
    ]);
    // Admins also find the hidden bank funder, explained by fields only they see.
    const forAdmin = await search("I need someone who can teach students about financial literacy", admin);
    expect(names(forAdmin)).toContain("Victor Alvarez");
  });
});

describe("staff results and reasons never use private fields", () => {
  it("ignores notes, funding focus and origin for staff, and never shows hidden people", async () => {
    const id = await createPerson(
      {
        full_name: "Pria Vate",
        skills: ["sewing"],
        status: "active",
        directory_visible: true,
        contact_mode: "direct",
        notes: "Knows the Launchpad Innovation Center director.",
        funding_focus: "zeppelin grants",
        origin: "met at the quokka gala",
      },
      admin.id,
    );
    for (const q of ["launchpad", "zeppelin", "quokka"]) {
      expect(await search(q, staff)).toEqual([]);
      const forAdmin = await search(q, admin);
      expect(forAdmin.find((p) => p.id === id)?.reasons).toEqual([{ kind: "notes", value: q }]);
    }
    const sewing = (await search("sewing launchpad", staff)).find((p) => p.id === id)!;
    expect(sewing.reasons).toEqual([{ kind: "skill", value: "sewing" }]);

    const staffNames = new Set<string>();
    for (const q of ["funder grant", "Launchpad Innovation Center", "foundation", ""]) {
      for (const p of (await searchPeople({ q, limit: 200 }, staff)).people) {
        staffNames.add(p.full_name);
        expect(p.reasons.some((r) => r.kind === "notes")).toBe(false);
        expect(p.directory_visible).toBe(true);
      }
    }
    for (const hidden of ["Dana Whitfield", "Victor Alvarez", "Lena Brooks", "Mei Lin", "Paul Avery", "Ray Dominguez"]) {
      expect(staffNames.has(hidden)).toBe(false);
    }
  });
});

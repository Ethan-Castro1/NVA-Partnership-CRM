/**
 * What staff can and can't see. Staff see only people in the staff directory
 * (directory_visible and not inactive), never private CRM fields, and email or
 * phone only for people set to direct contact. Hidden people never show up
 * anywhere: search, profiles, relationships, intro paths, the map, AI tools.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { fallbackAnswer, peopleForCards } from "./ai/assistant.server";
import { executeTool, toolsFor } from "./ai/tools.server";
import { createUser } from "./auth.server";
import { addCapPartner, createCap, getCapPartnerOptions, getCapPartners } from "./caps.server";
import { getVillageMap } from "./connections.server";
import {
  addRelationship,
  createPerson,
  findConnectorsForNeed,
  findIntroPaths,
  getCounts,
  getPeopleByIds,
  getPerson,
  getRelationships,
  searchPeople,
} from "./people.server";
import { canAccessPath, canViewPerson, isAdmin, staffVisibleSql, visiblePersonIds } from "./permissions.server";
import type { SessionUser } from "./types";

let admin: SessionUser, staff: SessionUser;
let board: string, mid: string, hiddenMid: string, target: string, target2: string, hiddenFunder: string, gone: string;

const visible = { status: "active" as const, directory_visible: true, contact_mode: "direct" as const };

beforeAll(async () => {
  const adminId = await createUser({ email: "perm-admin@test", name: "Ada Admin", password: "long-enough-pw", role: "admin" });
  const staffId = await createUser({ email: "perm-staff@test", name: "Sam Staff", password: "long-enough-pw", role: "staff" });
  admin = { id: adminId, email: "perm-admin@test", name: "Ada Admin", role: "admin", locale: "en" };
  staff = { id: staffId, email: "perm-staff@test", name: "Sam Staff", role: "staff", locale: "en" };

  board = await createPerson({ full_name: "Bea Board", affiliations: ["board"], ...visible }, null);
  mid = await createPerson({ full_name: "Mo Middle", skills: ["cooking"], email: "mo@example.org", phone: "410-555-0100", ...visible }, null);
  hiddenMid = await createPerson({ full_name: "Hidden Middle", status: "active" }, null);
  target = await createPerson(
    {
      full_name: "Sue Sewer",
      skills: ["sewing", "quilting"],
      contribution_types: ["skills_lesson"],
      email: "sue@example.org",
      phone: "410-555-0111",
      notes: "Secret note: zebra",
      funding_focus: "Private funding focus",
      origin: "Met at a private dinner",
      owner_user_id: adminId,
      ...visible,
      contact_mode: "introduction",
    },
    adminId,
  );
  target2 = await createPerson({ full_name: "Tia Twohop", skills: ["welding"], ...visible }, null);
  hiddenFunder = await createPerson(
    {
      full_name: "Fern Funder",
      skills: ["sewing"],
      contribution_types: ["funder"],
      email: "fern@example.org",
      notes: "Launchpad Innovation Center conversation",
      status: "active",
    },
    adminId,
  );
  gone = await createPerson({ full_name: "Gone Sewer", skills: ["sewing"], directory_visible: true, status: "inactive" }, null);

  await addRelationship({ personId: board, relatedPersonId: mid, kind: "knows" }, null);
  await addRelationship({ personId: mid, relatedPersonId: target, kind: "colleague" }, null);
  await addRelationship({ personId: board, relatedPersonId: hiddenMid, kind: "knows" }, null);
  await addRelationship({ personId: hiddenMid, relatedPersonId: target2, kind: "knows" }, null);
  await addRelationship({ personId: target, relatedPersonId: hiddenFunder, kind: "family" }, null);
});

describe("the rules", () => {
  it("decides who is visible", async () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(staff)).toBe(false);
    expect(staffVisibleSql("p")).toBe("(p.directory_visible AND p.status <> 'inactive')");
    expect(() => staffVisibleSql("p; DROP TABLE people")).toThrow();
    expect(await canViewPerson(staff, target)).toBe(true);
    expect(await canViewPerson(staff, hiddenFunder)).toBe(false);
    expect(await canViewPerson(staff, gone)).toBe(false);
    expect(await canViewPerson(admin, hiddenFunder)).toBe(true);
    expect(await canViewPerson(admin, "missing")).toBe(false);
    expect(await visiblePersonIds(staff, [hiddenFunder, target, target, "missing"])).toEqual([target]);
  });

  it("keeps staff away from admin pages", () => {
    for (const path of [
      "/app/admin", "/app/admin/users", "/app/admin/export.csv", "/app/opportunities", "/app/opportunities/new",
      "/app/follow-ups?view=today", "/app/communications", "/app/organizations/o1", "/app/people/new",
      "/app/people/abc/edit", "/app/people/abc/email", "/APP/Admin/Intake", "//app/admin",
    ]) {
      expect(canAccessPath("staff", path), path).toBe(false);
      expect(canAccessPath("admin", path), path).toBe(true);
    }
    for (const path of ["/app", "/app/people", "/app/people/abc", "/app/requests/new", "/app/caps/1", "/app/administer", "/join"]) {
      expect(canAccessPath("staff", path), path).toBe(true);
    }
  });
});

describe("people functions for staff", () => {
  it("search returns only visible people, with contact details only for direct contacts", async () => {
    const { people, total } = await searchPeople({ q: "sewing" }, staff);
    expect(people.map((p) => p.id)).toEqual([target]);
    expect(total).toBe(1);
    expect(people[0]).toMatchObject({ email: null, phone: null, source: null, contact_mode: "introduction" });

    const direct = (await searchPeople({ q: "cooking" }, staff)).people[0];
    expect(direct).toMatchObject({ id: mid, email: "mo@example.org", phone: "410-555-0100" });

    const forAdmin = await searchPeople({ q: "sewing" }, admin);
    expect(forAdmin.people.map((p) => p.id).sort()).toEqual([hiddenFunder, target].sort());
    expect(forAdmin.people.find((p) => p.id === target)?.email).toBe("sue@example.org");
  });

  it("never ranks staff results on private fields", async () => {
    expect((await searchPeople({ q: "zebra" }, staff)).people).toEqual([]);
    expect((await searchPeople({ q: "zebra" }, admin)).people.map((p) => p.id)).toEqual([target]);
    // Admin-only filters do nothing for staff.
    expect((await searchPeople({ directoryVisible: false, q: "sewing" }, staff)).people.map((p) => p.id)).toEqual([target]);
  });

  it("getPerson hides hidden people and private fields", async () => {
    expect(await getPerson(hiddenFunder, staff)).toBeNull();
    expect(await getPerson(gone, staff)).toBeNull();
    const seen = await getPerson(target, staff);
    expect(seen).toMatchObject({
      full_name: "Sue Sewer",
      email: null,
      phone: null,
      notes: null,
      funding_focus: null,
      origin: null,
      owner_user_id: null,
      owner_name: null,
      source: null,
    });
    const full = await getPerson(target, admin);
    expect(full).toMatchObject({
      email: "sue@example.org",
      notes: "Secret note: zebra",
      funding_focus: "Private funding focus",
      origin: "Met at a private dinner",
      owner_name: "Ada Admin",
      source: "admin",
    });
    expect((await getPeopleByIds([hiddenFunder, target, mid], staff)).map((p) => p.id).sort()).toEqual([mid, target].sort());
  });

  it("relationships and intro paths never pass through hidden people", async () => {
    expect((await getRelationships(target, staff)).map((r) => r.other.id)).toEqual([mid]);
    expect((await getRelationships(target, admin)).map((r) => r.other.id).sort()).toEqual([hiddenFunder, mid].sort());
    expect(await getRelationships(hiddenFunder, staff)).toEqual([]);

    const paths = await findIntroPaths(target, staff);
    expect(paths.map((p) => p.chain.map((c) => c.id))).toEqual([[board, mid, target]]);
    // Tia is only reachable through a hidden person: staff see no path, admins do.
    expect(await findIntroPaths(target2, staff)).toEqual([]);
    expect((await findIntroPaths(target2, admin)).map((p) => p.chain.map((c) => c.id))).toEqual([[board, hiddenMid, target2]]);
    expect(await findIntroPaths(hiddenFunder, staff)).toEqual([]);

    const matches = await findConnectorsForNeed({ q: "sewing" }, staff);
    expect(matches.map((m) => m.person.id)).toEqual([target]);
    const onPaths = matches.flatMap((m) => m.paths.flatMap((p) => p.chain.map((c) => c.id)));
    expect(onPaths).not.toContain(hiddenFunder);
    expect(onPaths).not.toContain(hiddenMid);
  });

  it("the village map and counts cover only the staff directory", async () => {
    const staffMap = await getVillageMap(staff);
    const ids = staffMap.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining([board, mid, target, target2]));
    for (const hidden of [hiddenFunder, hiddenMid, gone]) expect(ids).not.toContain(hidden);
    for (const link of staffMap.links) {
      expect(ids).toContain(link.source);
      expect(ids).toContain(link.target);
    }
    const adminMap = await getVillageMap(admin);
    expect(adminMap.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([hiddenFunder, hiddenMid]));
    // Cached per role: asking again as staff never returns the admin map.
    expect(await getVillageMap(staff)).toBe(staffMap);

    const staffCounts = await getCounts(staff);
    const adminCounts = await getCounts(admin);
    expect(staffCounts.people).toBeLessThan(adminCounts.people);
    expect(staffCounts.byContribution.funder ?? 0).toBe(0);
    expect(staffCounts.newSignups).toBe(0);
  });

  it("CAP partners and the partner picker are scoped too", async () => {
    const capId = await createCap({ title: "Sewing CAP" }, staff.id);
    await addCapPartner({ capId, personId: target }, admin.id);
    await addCapPartner({ capId, personId: hiddenFunder }, admin.id);
    const partners = await getCapPartners(capId, staff);
    expect(partners.map((p) => p.person.id)).toEqual([target]);
    expect(partners[0].person.email).toBeNull();
    expect((await getCapPartners(capId, admin)).map((p) => p.person.id).sort()).toEqual([hiddenFunder, target].sort());
    const options = (await getCapPartnerOptions(capId, staff)).map((p) => p.id);
    expect(options).toContain(mid);
    expect(options).not.toContain(hiddenMid);
  });
});

describe("AI tools and the assistant for staff", () => {
  const ctx = () => ({ user: staff });

  it("search and need tools return only visible people, without private fields", async () => {
    const search = await executeTool("search_people", { query: "sewing" }, ctx());
    const body = JSON.parse(search.content);
    expect(body.people.map((p: { id: string }) => p.id)).toEqual([target]);
    expect(body.people[0]).toMatchObject({ email: null, phone: null, contact: "introduction" });
    expect(search.content).not.toContain("Fern");

    const need = await executeTool("find_connectors_for_need", { query: "sewing" }, ctx());
    expect(need.personIds).not.toContain(hiddenFunder);
    expect(need.content).not.toContain("Fern Funder");
  });

  it("get_person and find_intro_paths treat a hidden person as missing and drop private notes", async () => {
    expect((await executeTool("get_person", { person_id: hiddenFunder }, ctx())).isError).toBe(true);
    expect((await executeTool("find_intro_paths", { person_id: hiddenFunder }, ctx())).isError).toBe(true);
    const out = await executeTool("get_person", { person_id: target }, ctx());
    const body = JSON.parse(out.content);
    expect(body).not.toHaveProperty("notes");
    expect(body).not.toHaveProperty("funding_focus");
    expect(body).not.toHaveProperty("source");
    expect(body.email).toBeNull();
    expect(out.content).not.toContain("zebra");
    expect(out.content).not.toContain("Fern Funder");
    const paths = JSON.parse((await executeTool("find_intro_paths", { person_id: target2 }, ctx())).content);
    expect(paths.paths).toEqual([]);

    const forAdmin = JSON.parse((await executeTool("get_person", { person_id: target }, { user: admin })).content);
    expect(forAdmin.notes).toBe("Secret note: zebra");
  });

  it("staff get no web search", async () => {
    expect(toolsFor({ web: true, strict: true, user: staff }).map((t) => t.name)).not.toContain("search_web");
    expect(toolsFor({ web: true, strict: true, user: admin }).map((t) => t.name)).toContain("search_web");
    const web = await executeTool("search_web", { query: "oyster scientists", kind: "people" }, ctx());
    expect(web.isError).toBe(true);
  });

  it("the plain-search assistant and its cards skip hidden people", async () => {
    const { personIds } = await fallbackAnswer("Who can teach sewing?", "en", staff);
    expect(personIds).toContain(target);
    expect(personIds).not.toContain(hiddenFunder);
    const cards = await peopleForCards([hiddenFunder, target], staff);
    expect(cards.map((c) => c.id)).toEqual([target]);
  });
});

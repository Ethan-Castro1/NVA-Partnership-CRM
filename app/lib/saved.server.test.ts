import { beforeAll, describe, expect, it } from "vitest";
import { createUser } from "./auth.server";
import { createPerson, updatePerson } from "./people.server";
import type { Viewer } from "./permissions.server";
import { countSaved, isSaved, listSaved, savePerson, savedIdsAmong, setSaved, unsavePerson } from "./saved.server";

let staff: Viewer;
let otherStaff: Viewer;
let admin: Viewer;
let visible: string;
let hidden: string;

beforeAll(async () => {
  staff = { id: await createUser({ email: "saver@test", name: "Saver", password: "long-enough-pw", role: "staff" }), role: "staff" };
  otherStaff = { id: await createUser({ email: "other@test", name: "Other", password: "long-enough-pw", role: "staff" }), role: "staff" };
  admin = { id: await createUser({ email: "boss@test", name: "Boss", password: "long-enough-pw", role: "admin" }), role: "admin" };
  visible = await createPerson({ full_name: "Vera Visible", status: "active", directory_visible: true, contact_mode: "direct" }, null);
  hidden = await createPerson({ full_name: "Hal Hidden", status: "active", notes: "private" }, null);
});

describe("saved resources", () => {
  it("lets staff save only people they can see; admins can save anyone", async () => {
    expect(await savePerson(staff, visible, "  Great for the bay CAP  ")).toBe(true);
    expect(await savePerson(staff, hidden)).toBe(false);
    expect(await setSaved(staff, hidden, true)).toBeNull();
    expect(await setSaved(staff, "missing-id")).toBeNull();
    expect(await isSaved(staff, hidden)).toBe(false);

    expect(await savePerson(admin, hidden)).toBe(true);
    expect((await listSaved(admin)).map((p) => p.full_name)).toEqual(["Hal Hidden"]);

    const [saved] = await listSaved(staff);
    expect(saved).toMatchObject({ id: visible, full_name: "Vera Visible", saved_note: "Great for the bay CAP" });
    // Staff lists never carry private fields.
    expect(saved.source).toBeNull();
    expect("notes" in saved).toBe(false);
  });

  it("keeps each list private to its owner", async () => {
    expect(await listSaved(otherStaff)).toEqual([]);
    expect([...(await savedIdsAmong(otherStaff, [visible, hidden]))]).toEqual([]);
    expect([...(await savedIdsAmong(staff, [visible, hidden, visible]))]).toEqual([visible]);
  });

  it("toggles, and re-saving keeps the note unless a new one is given", async () => {
    expect(await setSaved(otherStaff, visible)).toBe(true);
    expect(await setSaved(otherStaff, visible)).toBe(false);
    expect(await setSaved(otherStaff, visible, false)).toBe(false);
    expect(await setSaved(otherStaff, visible, true, "first")).toBe(true);
    expect(await setSaved(otherStaff, visible, true)).toBe(true);
    expect((await listSaved(otherStaff))[0].saved_note).toBe("first");
    await savePerson(otherStaff, visible, "second");
    expect((await listSaved(otherStaff))[0].saved_note).toBe("second");
    await unsavePerson(otherStaff, visible);
    expect(await isSaved(otherStaff, visible)).toBe(false);
  });

  it("drops people from a staff list once they are hidden, without deleting the save", async () => {
    expect(await countSaved(staff)).toBe(1);
    await updatePerson(visible, { directory_visible: false });
    expect(await listSaved(staff)).toEqual([]);
    expect(await countSaved(staff)).toBe(0);
    expect(await isSaved(staff, visible)).toBe(true);
    await updatePerson(visible, { directory_visible: true });
    expect((await listSaved(staff)).map((p) => p.id)).toEqual([visible]);
  });
});

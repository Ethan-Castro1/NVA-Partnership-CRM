import { beforeAll, describe, expect, it } from "vitest";
import { createUser } from "./auth.server";
import { query } from "./db.server";
import { listHistory } from "./history.server";
import { createPerson } from "./people.server";
import type { Viewer } from "./permissions.server";
import {
  adminUpdateRequest,
  assignPerson,
  createRequest,
  getRequest,
  getRequestAttention,
  listMyActiveRequests,
  listMyConnections,
  listPersonOptions,
  listRequests,
  listRequestsForPerson,
  removePerson,
  requestInputFromForm,
  setRequestStatus,
  updateRequestDetails,
} from "./requests.server";
import { savePerson } from "./saved.server";

let staff: Viewer;
let otherStaff: Viewer;
let admin: Viewer;
let volunteer: string; // visible, a lead (status must never change)
let speaker: string; // visible, active
let hidden: string; // not in the staff directory

const status = async (id: string) =>
  (await query<{ status: string }>("SELECT status FROM people WHERE id = $1", [id]))[0]?.status;
const completions = async (requestId: string) =>
  query<{ person_id: string; notes: string | null; visibility: string; origin: string }>(
    "SELECT person_id, notes, visibility, origin FROM engagements WHERE staff_request_id = $1 AND kind = 'engagement_completed'",
    [requestId],
  );

const created = async (viewer: Viewer, input: Parameters<typeof createRequest>[1]) => {
  const result = await createRequest(viewer, input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.id;
};

beforeAll(async () => {
  staff = { id: await createUser({ email: "t@test", name: "Taylor", password: "long-enough-pw", role: "staff" }), role: "staff" };
  otherStaff = { id: await createUser({ email: "m@test", name: "Marisol", password: "long-enough-pw", role: "staff" }), role: "staff" };
  admin = { id: await createUser({ email: "a@test", name: "Ashley", password: "long-enough-pw", role: "admin" }), role: "admin" };
  volunteer = await createPerson({ full_name: "Val Volunteer", status: "lead", directory_visible: true, contact_mode: "introduction" }, null);
  speaker = await createPerson({ full_name: "Sam Speaker", status: "active", directory_visible: true, contact_mode: "direct", email: "sam@example.org" }, null);
  hidden = await createPerson({ full_name: "Hana Hidden", status: "active", directory_visible: false, notes: "private" }, null);
});

describe("creating requests", () => {
  it("validates the short form", async () => {
    expect(await createRequest(staff, { need: "  " })).toEqual({ ok: false, errors: { need: "requests.error.needRequired" } });
    const bad = await createRequest(staff, { need: "x", preferredDate: "2026-13-40", participantCount: "0" });
    expect(bad).toMatchObject({ ok: false, errors: { preferredDate: "requests.error.badDate", participantCount: "requests.error.badCount" } });
    expect(await createRequest(staff, { need: "x", intro: true })).toMatchObject({
      ok: false,
      errors: { personId: "requests.error.introNeedsPerson" },
    });
    expect(await createRequest(staff, { need: "x", capId: "missing-cap" })).toMatchObject({
      ok: false,
      errors: { capId: "requests.error.capNotFound" },
    });
  });

  it("rejects a hidden person as a staff contact of interest (admins may use anyone)", async () => {
    expect(await createRequest(staff, { need: "Meet Hana", personId: hidden, intro: true })).toEqual({
      ok: false,
      errors: { personId: "requests.error.personNotFound" },
    });
    expect(await createRequest(staff, { need: "Meet nobody", personId: "no-such-person" })).toMatchObject({ ok: false });
    expect((await listPersonOptions(staff)).map((p) => p.id)).not.toContain(hidden);
    expect((await listPersonOptions(admin)).map((p) => p.id)).toContain(hidden);
    expect((await createRequest(admin, { need: "Admin asks about Hana", personId: hidden })).ok).toBe(true);
  });

  it("reads the form, sets the intro kind and links the contact of interest", async () => {
    const form = new FormData();
    form.set("need", "Introduction to Val");
    form.set("personId", volunteer);
    form.set("intro", "1");
    form.set("participantCount", "12");
    form.set("capId", "none");
    const id = await created(staff, requestInputFromForm(form));
    const r = await getRequest(staff, id);
    expect(r).toMatchObject({ kind: "introduction", status: "open", participant_count: 12, cap_id: null, requester_name: "Taylor" });
    expect(r?.people.map((p) => [p.id, p.request_role])).toEqual([[volunteer, "interest"]]);
    // A contact without the intro box is a plain resource request.
    const plain = await created(staff, { need: "Talk with Sam", personId: speaker });
    expect((await getRequest(staff, plain))?.kind).toBe("resource");
  });
});

describe("ownership", () => {
  it("lets staff see and update only their own requests", async () => {
    const mine = await created(staff, { need: "Volunteers for field day", timeframe: "Late May" });
    const theirs = await created(otherStaff, { need: "Voluntarios para la feria" });

    expect(await getRequest(staff, theirs)).toBeNull();
    expect(await getRequest(otherStaff, mine)).toBeNull();
    expect((await listRequests(staff)).map((r) => r.id)).not.toContain(theirs);
    expect((await listRequests(staff, { requesterId: otherStaff.id })).every((r) => r.requester_id === staff.id)).toBe(true);
    expect(await setRequestStatus(staff, theirs, { status: "canceled" })).toEqual({ ok: false, error: "not_found" });
    expect(await updateRequestDetails(staff, theirs, { need: "hijack" })).toBeNull();
    expect((await getRequest(otherStaff, theirs))?.need).toBe("Voluntarios para la feria");

    // Admins see everything; `mine` narrows to their own.
    expect(await getRequest(admin, theirs)).not.toBeNull();
    const all = (await listRequests(admin)).map((r) => r.id);
    expect(all).toEqual(expect.arrayContaining([mine, theirs]));
    expect((await listRequests(admin, { mine: true })).every((r) => r.requester_id === admin.id)).toBe(true);

    // The owner can edit and cancel.
    expect(await updateRequestDetails(staff, mine, { need: "Volunteers for field day (6)", participantCount: 6 })).toEqual({ ok: true, id: mine });
    expect((await getRequest(staff, mine))?.participant_count).toBe(6);
    expect(await setRequestStatus(staff, mine, { status: "canceled" })).toMatchObject({ ok: true, status: "canceled" });
    expect((await listMyActiveRequests(staff, 50)).map((r) => r.id)).not.toContain(mine);
  });

  it("only shows staff the people they may see on a request", async () => {
    const id = await created(staff, { need: "Someone for the bay CAP" });
    expect(await assignPerson(admin, id, hidden)).toBe(true);
    expect((await getRequest(admin, id))?.people.map((p) => p.id)).toEqual([hidden]);
    expect((await getRequest(staff, id))?.people).toEqual([]);
    expect(await listRequestsForPerson(staff, hidden)).toEqual([]);
    expect(await removePerson(admin, id, hidden)).toBe(true);
  });
});

describe("admin", () => {
  it("assigns people, replies and updates the status; staff cannot", async () => {
    const id = await created(staff, { need: "Introduction to Val", personId: volunteer, intro: true });
    expect(await assignPerson(staff, id, speaker)).toBe(false);
    expect(await removePerson(staff, id, volunteer)).toBe(false);
    expect(await adminUpdateRequest(staff, id, { status: "arranged" })).toEqual({ ok: false, error: "not_found" });

    const attention = await getRequestAttention(admin);
    expect(attention.introductions).toBeGreaterThanOrEqual(1);
    expect(attention.items[0].kind).toBe("introduction");
    expect(await getRequestAttention(staff)).toEqual({ open: 0, introductions: 0, items: [] });

    expect(await assignPerson(admin, id, volunteer)).toBe(true); // interest becomes assigned
    expect(await assignPerson(admin, id, "missing")).toBe(false);
    expect(await adminUpdateRequest(admin, id, { assignedTo: staff.id })).toEqual({ ok: false, error: "invalid" });
    expect(
      await adminUpdateRequest(admin, id, { status: "arranged", response: "Val will come Tuesday at 9.", assignedTo: admin.id }),
    ).toMatchObject({ ok: true, status: "arranged" });

    const seen = await getRequest(staff, id);
    expect(seen).toMatchObject({ status: "arranged", response: "Val will come Tuesday at 9.", assigned_name: "Ashley" });
    expect(seen?.people.map((p) => [p.id, p.request_role])).toEqual([[volunteer, "assigned"]]);
    expect(await completions(id)).toEqual([]);
  });
});

describe("completion", () => {
  it("records engagement_completed once per person and never changes their status", async () => {
    const id = await created(staff, { need: "Field day volunteers", personId: volunteer, preferredDate: "2026-01-15" });
    expect(await status(volunteer)).toBe("lead");

    const first = await setRequestStatus(staff, id, { status: "completed", note: "  Great help with the relay.  " });
    expect(first).toMatchObject({ ok: true, status: "completed" });
    expect(first.ok && first.historyIds).toHaveLength(1);
    // Completing again (or an admin re-saving with a note) adds nothing new.
    const again = await setRequestStatus(staff, id, { status: "completed" });
    const byAdmin = await adminUpdateRequest(admin, id, { status: "completed", note: "Re-saved" });
    expect(again.ok && again.historyIds).toEqual(first.ok && first.historyIds);
    expect(byAdmin.ok && byAdmin.historyIds).toEqual(first.ok && first.historyIds);

    const rows = await completions(id);
    expect(rows).toEqual([{ person_id: volunteer, notes: "Great help with the relay.", visibility: "staff", origin: "staff_request" }]);
    expect(await status(volunteer)).toBe("lead");

    // Staff see it on the profile history, dated on the preferred date.
    const history = await listHistory(volunteer, staff);
    const entry = history.find((h) => h.kind === "engagement_completed");
    expect(entry).toMatchObject({ happened_on: "2026-01-15", staff_request_id: id });
    // Another staff member sees the entry but not the link to someone else's request.
    expect((await listHistory(volunteer, otherStaff)).find((h) => h.id === entry?.id)?.staff_request_id).toBeNull();

    // A completed request stays completed for staff; admins can reopen it.
    expect(await setRequestStatus(staff, id, { status: "canceled" })).toEqual({ ok: false, error: "locked" });
    expect(await setRequestStatus(admin, id, { status: "open" })).toMatchObject({ ok: true });
    expect(await setRequestStatus(staff, id, { status: "completed" })).toMatchObject({ ok: true });
    expect(await completions(id)).toHaveLength(1);
  });

  it("records the assigned people when someone was assigned, not the contact of interest", async () => {
    const id = await created(staff, { need: "Healthcare speaker", personId: volunteer });
    await assignPerson(admin, id, speaker);
    await setRequestStatus(staff, id, { status: "completed" });
    expect((await completions(id)).map((r) => r.person_id)).toEqual([speaker]);
    expect(await status(speaker)).toBe("active");
  });

  it("records nothing for a request with no people", async () => {
    const id = await created(staff, { need: "Anyone for the bake sale" });
    expect(await setRequestStatus(staff, id, { status: "completed" })).toMatchObject({ ok: true, historyIds: [] });
  });
});

describe("My Connections", () => {
  it("lists people saved, requested or worked with, only ones the viewer can see", async () => {
    const fresh: Viewer = { id: await createUser({ email: "n@test", name: "New", password: "long-enough-pw", role: "staff" }), role: "staff" };
    expect(await listMyConnections(fresh)).toEqual([]);
    await savePerson(fresh, speaker);
    const id = await created(fresh, { need: "Meet Val", personId: volunteer, intro: true });
    await assignPerson(admin, id, hidden); // hidden people never show to staff
    let list = await listMyConnections(fresh);
    expect(list.map((c) => [c.id, c.saved, c.requested, c.worked_with])).toEqual(
      expect.arrayContaining([
        [speaker, true, false, false],
        [volunteer, false, true, false],
      ]),
    );
    expect(list.map((c) => c.id)).not.toContain(hidden);
    expect(list.find((c) => c.id === volunteer)).toMatchObject({ last_request_id: id, email: null });

    await removePerson(admin, id, hidden);
    await setRequestStatus(fresh, id, { status: "completed" });
    list = await listMyConnections(fresh);
    expect(list.find((c) => c.id === volunteer)?.worked_with).toBe(true);
    // Other people's requests never leak into someone's connections.
    expect((await listMyConnections(otherStaff)).map((c) => c.id)).not.toContain(volunteer);
  });
});

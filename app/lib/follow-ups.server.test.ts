import { beforeAll, describe, expect, it } from "vitest";
import { createUser } from "./auth.server";
import { addDays } from "./dates";
import { query, queryOne } from "./db.server";
import {
  cancelFollowUp,
  completeFollowUp,
  countFollowUps,
  createFollowUp,
  followUpView,
  getPersonCrm,
  listFollowUps,
  parseFollowUpForm,
  parseNextFollowUp,
  rescheduleFollowUp,
  setAwaitingResponse,
  type FollowUpFilter,
} from "./follow-ups.server";
import { createOpportunity } from "./opportunities.server";
import { createPerson } from "./people.server";

let adminId: string, staffId: string;
const admin = () => ({ id: adminId, role: "admin" as const });
const staff = () => ({ id: staffId, role: "staff" as const });
const TODAY = "2026-10-20";

async function expect403(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Response);
  expect((error as Response).status).toBe(403);
}

beforeAll(async () => {
  adminId = await createUser({ email: "fu-admin@test", name: "Fay Admin", password: "long-enough-pw", role: "admin" });
  staffId = await createUser({ email: "fu-staff@test", name: "Stu Staff", password: "long-enough-pw", role: "staff" });
});

describe("followUpView", () => {
  it("buckets by the school's today", () => {
    const open = (due_on: string, awaiting_response = false) => ({ status: "open", due_on, awaiting_response });
    expect(followUpView(open("2026-10-19"), TODAY)).toBe("overdue");
    expect(followUpView(open("2026-10-20"), TODAY)).toBe("today");
    expect(followUpView(open("2026-10-21"), TODAY)).toBe("upcoming");
    expect(followUpView(open("2026-10-01", true), TODAY)).toBe("awaiting");
    expect(followUpView({ status: "completed", due_on: "2026-10-01", awaiting_response: false }, TODAY)).toBe("completed");
    expect(followUpView({ status: "canceled", due_on: "2026-10-01", awaiting_response: false }, TODAY)).toBeNull();
  });
});

describe("follow-ups", () => {
  it("are admin only: staff get a 403 everywhere", async () => {
    const person = await createPerson({ full_name: "Vera Visible", status: "active", directory_visible: true, contact_mode: "direct" }, null);
    const id = await createFollowUp(admin(), { personId: person, action: "Call Vera", dueOn: TODAY });
    await expect403(listFollowUps(staff()));
    await expect403(countFollowUps(staff()));
    await expect403(getPersonCrm(staff(), person));
    await expect403(createFollowUp(staff(), { personId: person, action: "Sneaky", dueOn: TODAY }));
    await expect403(completeFollowUp(staff(), id));
    await expect403(rescheduleFollowUp(staff(), id, addDays(TODAY, 3)));
    await expect403(setAwaitingResponse(staff(), id, true));
    await expect403(cancelFollowUp(staff(), id));
    expect((await queryOne<{ status: string }>("SELECT status FROM follow_ups WHERE id = $1", [id]))?.status).toBe("open");
  });

  it("lists and counts each view by date, with today passed in", async () => {
    const person = await createPerson({ full_name: "Bucket Person" }, null);
    const make = (action: string, dueOn: string, awaitingResponse = false) =>
      createFollowUp(admin(), { personId: person, action, dueOn, awaitingResponse });
    await make("late", addDays(TODAY, -2));
    await make("now", TODAY);
    await make("soon", addDays(TODAY, 4));
    await make("waiting", addDays(TODAY, -5), true);
    const finished = await make("finished", addDays(TODAY, -1));
    await completeFollowUp(admin(), finished);
    const dropped = await make("dropped", TODAY);
    await cancelFollowUp(admin(), dropped);

    const actions = async (views: FollowUpFilter["views"]) =>
      (await listFollowUps(admin(), { personId: person, today: TODAY, views })).map((f) => f.action);
    expect(await actions("overdue")).toEqual(["late"]);
    expect(await actions("today")).toEqual(["now"]);
    expect(await actions("upcoming")).toEqual(["soon"]);
    expect(await actions("awaiting")).toEqual(["waiting"]);
    expect(await actions("completed")).toEqual(["finished"]);
    // Default: every open view, soonest first.
    expect(await actions(undefined)).toEqual(["waiting", "late", "now", "soon"]);
    expect(await countFollowUps(admin(), { personId: person, today: TODAY })).toEqual({
      overdue: 1, today: 1, upcoming: 1, awaiting: 1, completed: 1,
    });

    // The next day, "now" is overdue and "soon" is still upcoming.
    const tomorrow = await listFollowUps(admin(), { personId: person, today: addDays(TODAY, 1), views: ["overdue"] });
    expect(tomorrow.map((f) => [f.action, f.view])).toEqual([
      ["late", "overdue"],
      ["now", "overdue"],
    ]);
  });

  it("completes (with history), reschedules, and creates the next step", async () => {
    const person = await createPerson({ full_name: "Jordan Smith", status: "lead" }, null);
    const opp = await createOpportunity({ ...admin(), locale: "en" }, {
      personId: person, track: "engagement", kind: "internship", title: "Internship", stage: "contacted",
    });
    const id = await createFollowUp(admin(), {
      personId: person, opportunityId: opp, action: "Send information about internship opportunities", dueOn: "2026-10-22",
    });

    await rescheduleFollowUp(admin(), id, "2026-10-24");
    expect((await listFollowUps(admin(), { personId: person, today: TODAY }))[0]).toMatchObject({ due_on: "2026-10-24", view: "upcoming" });
    await setAwaitingResponse(admin(), id, true);
    expect((await listFollowUps(admin(), { personId: person, today: TODAY }))[0]?.view).toBe("awaiting");

    const result = await completeFollowUp(admin(), id, { next: { action: "Check they got it", dueOn: "2026-10-29" } });
    expect(result.completed).toBe(true);
    expect(result.nextId).toBeTruthy();
    // Completing twice changes nothing.
    expect((await completeFollowUp(admin(), id)).completed).toBe(false);
    await expect(rescheduleFollowUp(admin(), id, "2026-11-01")).rejects.toThrow();

    const open = await listFollowUps(admin(), { personId: person, today: TODAY });
    expect(open.map((f) => [f.action, f.opportunity_id, f.owner_user_id])).toEqual([["Check they got it", opp, adminId]]);
    const done = await listFollowUps(admin(), { personId: person, today: TODAY, views: "completed" });
    expect(done[0]).toMatchObject({ id, status: "completed", awaiting_response: false, completed_by_name: "Fay Admin" });

    const kinds = await query<{ kind: string; visibility: string }>(
      "SELECT kind, visibility FROM engagements WHERE person_id = $1 AND kind LIKE 'follow_up%' ORDER BY created_at",
      [person],
    );
    expect(kinds).toEqual([
      { kind: "follow_up_scheduled", visibility: "admin" },
      { kind: "follow_up_completed", visibility: "admin" },
      { kind: "follow_up_scheduled", visibility: "admin" },
    ]);
    expect((await queryOne<{ status: string }>("SELECT status FROM people WHERE id = $1", [person]))?.status).toBe("lead");

    const crm = await getPersonCrm(admin(), person, { today: TODAY });
    expect(crm.opportunities.map((o) => o.id)).toEqual([opp]);
    expect(crm.followUps.map((f) => f.status)).toEqual(["open", "completed"]);
    expect(crm.owners.some((o) => o.id === adminId)).toBe(true);
  });

  it("refuses an opportunity that belongs to someone else", async () => {
    const a = await createPerson({ full_name: "Ann A" }, null);
    const b = await createPerson({ full_name: "Ben B" }, null);
    const opp = await createOpportunity({ ...admin(), locale: "en" }, { personId: a, track: "engagement", kind: "other", title: "A's", stage: "contacted" });
    await expect(createFollowUp(admin(), { personId: b, opportunityId: opp, action: "Mixed up", dueOn: TODAY })).rejects.toThrow();
  });
});

describe("form parsing", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  it("reads a new follow-up and the optional next step", () => {
    expect(parseFollowUpForm(form({ personId: "p", action: " Call ", dueOn: TODAY, opportunityId: "none", awaitingResponse: "on" }))).toEqual({
      ok: true,
      value: { personId: "p", action: "Call", dueOn: TODAY, opportunityId: null, ownerUserId: null, awaitingResponse: true },
    });
    expect(parseFollowUpForm(form({ action: "", dueOn: "soon" }))).toEqual({
      ok: false,
      errors: { personId: "crm.error.personRequired", action: "crm.error.actionRequired", dueOn: "crm.error.badDate" },
    });
    expect(parseNextFollowUp(form({}))).toEqual({ ok: true, value: null });
    expect(parseNextFollowUp(form({ nextAction: "Again", nextDueOn: TODAY }))).toEqual({ ok: true, value: { action: "Again", dueOn: TODAY } });
    expect(parseNextFollowUp(form({ nextAction: "Again" }))).toEqual({ ok: false, errors: { nextDueOn: "crm.error.badDate" } });
  });
});

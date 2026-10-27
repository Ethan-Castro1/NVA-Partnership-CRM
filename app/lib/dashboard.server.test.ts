import { beforeAll, describe, expect, it } from "vitest";
import { createUser } from "./auth.server";
import { addDays, schoolToday } from "./dates";
import {
  getAdminDashboard,
  getNavCounts,
  getStaffDashboard,
  listNewSignups,
  listRecentActivity,
  listRecentResources,
  openOpportunitiesByStage,
} from "./dashboard.server";
import { query } from "./db.server";
import { createFollowUp } from "./follow-ups.server";
import { recordHistory } from "./history.server";
import { createOpportunity } from "./opportunities.server";
import { createPerson } from "./people.server";
import type { Viewer } from "./permissions.server";
import { createRequest } from "./requests.server";
import { savePerson } from "./saved.server";

let staff: Viewer & { name: string };
let admin: Viewer;
let direct: string;
let intro: string;
let funder: string;

const rejects403 = async (p: Promise<unknown>) => {
  const thrown = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(thrown).toBeInstanceOf(Response);
  expect((thrown as Response).status).toBe(403);
};

beforeAll(async () => {
  staff = { id: await createUser({ email: "t@test", name: "Taylor", password: "long-enough-pw", role: "staff" }), role: "staff", name: "Taylor" };
  admin = { id: await createUser({ email: "a@test", name: "Ashley", password: "long-enough-pw", role: "admin" }), role: "admin" };
  direct = await createPerson(
    { full_name: "Dee Direct", status: "active", directory_visible: true, contact_mode: "direct", email: "dee@example.org", skills: ["carpentry"] },
    null,
  );
  intro = await createPerson(
    { full_name: "Ivy Intro", status: "active", directory_visible: true, contact_mode: "introduction", email: "ivy@example.org" },
    null,
  );
  funder = await createPerson(
    { full_name: "Fran Funder", status: "active", directory_visible: false, notes: "Launchpad talk", contribution_types: ["funder"] },
    null,
  );
  const today = schoolToday();
  const opp = await createOpportunity(admin, { personId: funder, track: "funding", kind: "grant", title: "Fran grant", stage: "cultivating" });
  await createOpportunity(admin, { personId: direct, track: "engagement", kind: "skills_lesson", title: "Woodshop", stage: "contacted" });
  await createOpportunity(admin, { personId: direct, track: "engagement", kind: "skills_lesson", title: "Done one", stage: "completed" });
  await createFollowUp(admin, { personId: funder, action: "Call Fran", dueOn: addDays(today, -2), opportunityId: opp });
  await createFollowUp(admin, { personId: direct, action: "Send dates", dueOn: today });
  await createFollowUp(admin, { personId: intro, action: "Wait on Ivy", dueOn: addDays(today, 3), awaitingResponse: true });
  await recordHistory({ personId: funder, kind: "email_received", origin: "email", visibility: "admin", notes: "Re: grant" });
  await recordHistory({ personId: direct, kind: "note", origin: "manual", visibility: "admin", notes: "Met at reception" });
  const req = await createRequest(staff, { need: "Intro to Ivy", personId: intro, intro: true });
  if (!req.ok) throw new Error("request failed");
  await query(
    `INSERT INTO intake_submissions (id, payload, locale, status) VALUES ('sub1', $1::jsonb, 'en', 'new')`,
    [JSON.stringify({ full_name: "Walt Wood", contribution_types: ["skills_lesson"] })],
  );
  await savePerson(staff, intro);
});

describe("admin dashboard", () => {
  it("collects the actionable items", async () => {
    const d = await getAdminDashboard(admin);
    expect(d.followUpCounts).toMatchObject({ overdue: 1, today: 1, awaiting: 1 });
    expect(d.dueNow.map((f) => f.action)).toEqual(["Call Fran", "Send dates"]);
    expect(d.awaiting.map((f) => f.action)).toEqual(["Wait on Ivy"]);
    expect(d.attention.introductions).toBe(1);
    expect(d.signupCount).toBe(1);
    expect(d.signups[0]).toMatchObject({ id: "sub1", full_name: "Walt Wood", contribution_types: ["skills_lesson"] });
    expect(d.people.some((p) => p.id === funder)).toBe(true);
  });

  it("marks email activity apart from manual notes", async () => {
    const rows = await listRecentActivity(admin);
    expect(rows.find((r) => r.kind === "email_received")?.origin).toBe("email");
    expect(rows.find((r) => r.kind === "note")?.origin).toBe("manual");
  });

  it("counts open opportunities per stage only", async () => {
    const stages = await openOpportunitiesByStage(admin);
    expect(stages).toEqual([
      { track: "engagement", stage: "contacted", count: 1 },
      { track: "funding", stage: "cultivating", count: 1 },
    ]);
  });

  it("gives the sidebar its counts", async () => {
    expect(await getNavCounts(admin)).toEqual({ overdueFollowUps: 1, newSignups: 1, introductions: 1 });
  });
});

describe("staff dashboard", () => {
  it("refuses the admin pieces", async () => {
    await rejects403(getAdminDashboard(staff));
    await rejects403(listRecentActivity(staff));
    await rejects403(listNewSignups(staff));
    await rejects403(openOpportunitiesByStage(staff));
    expect(await getNavCounts(staff)).toEqual({ overdueFollowUps: 0, newSignups: 0, introductions: 0 });
  });

  it("shows only staff-directory people, with contact details only when direct", async () => {
    const recent = await listRecentResources(staff);
    const ids = recent.map((p) => p.id);
    expect(ids).toContain(direct);
    expect(ids).toContain(intro);
    expect(ids).not.toContain(funder);
    expect(recent.find((p) => p.id === direct)?.email).toBe("dee@example.org");
    expect(recent.find((p) => p.id === intro)?.email).toBeNull();
    expect(recent.find((p) => p.id === intro)?.saved).toBe(true);
    expect(recent.every((p) => p.source === null)).toBe(true);
  });

  it("collects my requests, saved people and no private data", async () => {
    const d = await getStaffDashboard(staff);
    expect(d.myRequests.map((r) => r.need)).toEqual(["Intro to Ivy"]);
    expect(d.saved.map((p) => p.id)).toEqual([intro]);
    const json = JSON.stringify(d);
    expect(json).not.toContain("Fran");
    expect(json).not.toContain("Launchpad");
  });
});

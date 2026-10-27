import { beforeAll, describe, expect, it } from "vitest";
import { createUser } from "./auth.server";
import { query, queryOne } from "./db.server";
import { defaultVisibility, listHistory, recordHistory } from "./history.server";
import { createPerson, logEngagement } from "./people.server";
import { schoolToday } from "./dates";

let adminId: string, staffId: string, otherStaffId: string;
const admin = () => ({ id: adminId, role: "admin" as const });
const staff = () => ({ id: staffId, role: "staff" as const });

const statusOf = async (id: string) => (await queryOne<{ status: string }>("SELECT status FROM people WHERE id = $1", [id]))?.status;

beforeAll(async () => {
  adminId = await createUser({ email: "hist-admin@test", name: "Ada Admin", password: "long-enough-pw", role: "admin" });
  staffId = await createUser({ email: "hist-staff@test", name: "Sam Staff", password: "long-enough-pw", role: "staff" });
  otherStaffId = await createUser({ email: "hist-other@test", name: "Olive Other", password: "long-enough-pw", role: "staff" });
});

describe("recordHistory", () => {
  it("never changes the person's status unless asked", async () => {
    const lead = await createPerson({ full_name: "Lee Lead", status: "lead" }, null);
    for (const kind of ["lesson", "meeting", "engagement_completed", "opportunity_updated", "signup_approved"] as const) {
      await recordHistory({ personId: lead, kind, origin: "system", visibility: defaultVisibility(kind) });
    }
    expect(await statusOf(lead)).toBe("lead");

    await recordHistory({ personId: lead, kind: "lesson", origin: "manual", visibility: "staff", promoteStatus: true });
    expect(await statusOf(lead)).toBe("active");

    // Promotion only moves leads and new contacts, never someone made inactive.
    const gone = await createPerson({ full_name: "Gone Person", status: "inactive" }, null);
    await recordHistory({ personId: gone, kind: "lesson", origin: "manual", visibility: "staff", promoteStatus: true });
    expect(await statusOf(gone)).toBe("inactive");
  });

  it("writes origin, visibility, links and today's school date", async () => {
    const person = await createPerson({ full_name: "Dee Default" }, null);
    const id = await recordHistory({
      personId: person, kind: "email_sent", origin: "email", visibility: "admin", userId: adminId, meta: { subject: "Hello" },
    });
    const row = await queryOne<{ kind: string; origin: string; visibility: string; happened_on: string; meta: { subject: string } }>(
      "SELECT kind, origin, visibility, happened_on::text AS happened_on, meta FROM engagements WHERE id = $1",
      [id],
    );
    expect(row).toMatchObject({ kind: "email_sent", origin: "email", visibility: "admin", happened_on: schoolToday() });
    expect(row?.meta.subject).toBe("Hello");
    await expect(recordHistory({ personId: person, kind: "bogus" as never, origin: "manual", visibility: "admin" })).rejects.toThrow();
  });

  it("records a staff request's completion once per person", async () => {
    const person = await createPerson({ full_name: "Rae Request" }, null);
    const requestId = crypto.randomUUID();
    await query("INSERT INTO staff_requests (id, requester_id, need) VALUES ($1, $2, 'A sewing lesson')", [requestId, staffId]);
    const entry = { personId: person, kind: "engagement_completed" as const, origin: "staff_request" as const, visibility: "staff" as const, staffRequestId: requestId };
    const first = await recordHistory(entry);
    const second = await recordHistory({ ...entry, notes: "again" });
    expect(second).toBe(first);
    expect(await query("SELECT 1 FROM engagements WHERE staff_request_id = $1", [requestId])).toHaveLength(1);
  });

  it("keeps the old logEngagement behavior: work is shared and activates, calls stay private", async () => {
    const person = await createPerson({ full_name: "Nia New", status: "new" }, null);
    await logEngagement({ personId: person, kind: "call", notes: "Left a message" }, adminId);
    expect(await statusOf(person)).toBe("new");
    await logEngagement({ personId: person, kind: "guest_speaker", happenedOn: "2026-10-01" }, staffId);
    expect(await statusOf(person)).toBe("active");
    const rows = await query<{ kind: string; visibility: string }>("SELECT kind, visibility FROM engagements WHERE person_id = $1 ORDER BY kind", [person]);
    expect(rows).toEqual([
      { kind: "call", visibility: "admin" },
      { kind: "guest_speaker", visibility: "staff" },
    ]);
  });
});

describe("listHistory", () => {
  it("shows staff only shared entries on visible people, without admins' names", async () => {
    const visible = await createPerson({ full_name: "Vic Visible", status: "active", directory_visible: true, contact_mode: "direct" }, null);
    await logEngagement({ personId: visible, kind: "lesson", happenedOn: "2026-10-02", notes: "Great lesson" }, adminId);
    await logEngagement({ personId: visible, kind: "volunteer", happenedOn: "2026-10-03" }, staffId);
    await logEngagement({ personId: visible, kind: "note", happenedOn: "2026-10-04", notes: "Private: wants to be paid" }, adminId);
    const requestId = crypto.randomUUID();
    await query("INSERT INTO staff_requests (id, requester_id, need) VALUES ($1, $2, 'Help')", [requestId, otherStaffId]);
    await recordHistory({ personId: visible, kind: "engagement_completed", origin: "staff_request", visibility: "staff", staffRequestId: requestId, happenedOn: "2026-10-05" });

    const forAdmin = await listHistory(visible, admin());
    expect(forAdmin.map((e) => e.kind)).toEqual(["engagement_completed", "note", "volunteer", "lesson"]);
    expect(forAdmin.find((e) => e.kind === "lesson")?.user_name).toBe("Ada Admin");
    expect(forAdmin[0].staff_request_id).toBe(requestId);

    const forStaff = await listHistory(visible, staff());
    expect(forStaff.map((e) => e.kind)).toEqual(["engagement_completed", "volunteer", "lesson"]);
    expect(forStaff.find((e) => e.kind === "lesson")?.user_name).toBeNull();
    expect(forStaff.find((e) => e.kind === "volunteer")?.user_name).toBe("Sam Staff");
    expect(JSON.stringify(forStaff)).not.toContain("wants to be paid");
    // Someone else's request id isn't shared.
    expect(forStaff[0].staff_request_id).toBeNull();
    expect(forStaff.every((e) => e.happened_on.match(/^\d{4}-\d{2}-\d{2}$/))).toBe(true);
  });

  it("gives staff nothing for a hidden person", async () => {
    const hidden = await createPerson({ full_name: "Hal Hidden", status: "active" }, null);
    await logEngagement({ personId: hidden, kind: "lesson" }, adminId);
    expect(await listHistory(hidden, staff())).toEqual([]);
    expect(await listHistory(hidden, admin())).toHaveLength(1);
  });
});

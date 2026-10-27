import { beforeAll, describe, expect, it } from "vitest";
import { createUser } from "./auth.server";
import { query, queryOne } from "./db.server";
import {
  changeOpportunityStage,
  countOpenOpportunities,
  createOpportunity,
  deleteOpportunity,
  getCrmFormOptions,
  getOpportunity,
  getOpportunityHistory,
  listOpportunities,
  parseOpportunityForm,
  updateOpportunity,
  type OpportunityInput,
} from "./opportunities.server";
import { createPerson } from "./people.server";

let adminId: string, staffId: string;
const admin = () => ({ id: adminId, role: "admin" as const, locale: "en" as const });
const staff = () => ({ id: staffId, role: "staff" as const });

const statusOf = async (id: string) => (await queryOne<{ status: string }>("SELECT status FROM people WHERE id = $1", [id]))?.status;

async function expect403(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Response);
  expect((error as Response).status).toBe(403);
}

beforeAll(async () => {
  adminId = await createUser({ email: "opp-admin@test", name: "Opal Admin", password: "long-enough-pw", role: "admin" });
  staffId = await createUser({ email: "opp-staff@test", name: "Stan Staff", password: "long-enough-pw", role: "staff" });
});

const base = (personId: string, extra: Partial<OpportunityInput> = {}): OpportunityInput => ({
  personId, track: "engagement", kind: "skills_lesson", title: "Sewing workshop", stage: "not_contacted", ...extra,
});

describe("opportunities are admin only", () => {
  it("gives staff a 403 from every function", async () => {
    const person = await createPerson({ full_name: "Paz Private", status: "active", directory_visible: true, contact_mode: "direct" }, null);
    const id = await createOpportunity(admin(), base(person));
    await expect403(listOpportunities(staff()));
    await expect403(getOpportunity(staff(), id));
    await expect403(getOpportunityHistory(staff(), id));
    await expect403(countOpenOpportunities(staff()));
    await expect403(getCrmFormOptions(staff()));
    await expect403(createOpportunity(staff(), base(person)));
    await expect403(changeOpportunityStage(staff(), id, "contacted"));
    await expect403(updateOpportunity(staff(), id, base(person, { title: "Changed" })));
    await expect403(deleteOpportunity(staff(), id));
    expect((await getOpportunity(admin(), id))?.title).toBe("Sewing workshop");
  });
});

describe("stages", () => {
  it("records a stage change in history and never touches the person's status", async () => {
    const lead = await createPerson({ full_name: "Lena Lead", status: "lead" }, null);
    const id = await createOpportunity(admin(), base(lead));
    for (const stage of ["contacted", "committed", "completed"]) {
      expect(await changeOpportunityStage(admin(), id, stage)).toEqual({ changed: true });
      expect(await statusOf(lead)).toBe("lead");
    }
    // Same stage again: nothing to record.
    expect(await changeOpportunityStage(admin(), id, "completed")).toEqual({ changed: false });

    const opp = await getOpportunity(admin(), id);
    expect(opp).toMatchObject({ stage: "completed", open: false });
    expect(opp?.closed_at).toBeTruthy();

    const rows = await query<{ kind: string; visibility: string; origin: string; notes: string; to: string }>(
      "SELECT kind, visibility, origin, notes, meta->>'to' AS to FROM engagements WHERE opportunity_id = $1 ORDER BY created_at",
      [id],
    );
    expect(rows.map((r) => r.to)).toEqual(["not_contacted", "contacted", "committed", "completed"]);
    expect(rows.every((r) => r.kind === "opportunity_updated" && r.visibility === "admin" && r.origin === "manual")).toBe(true);
    expect(rows.at(-1)?.notes).toBe("Sewing workshop: Completed");

    // Reopening clears closed_at; status still untouched.
    await changeOpportunityStage(admin(), id, "committed", "They can do spring");
    expect(await getOpportunity(admin(), id)).toMatchObject({ open: true, closed_at: null });
    expect(await statusOf(lead)).toBe("lead");
    expect((await getOpportunityHistory(admin(), id))[0]?.notes).toBe("Sewing workshop: Committed. They can do spring");
  });

  it("keeps each track to its own stages and kinds", async () => {
    const funder = await createPerson({ full_name: "Fran Funder", status: "active" }, null);
    await expect(createOpportunity(admin(), base(funder, { track: "funding", kind: "grant", stage: "contacted" }))).rejects.toThrow();
    await expect(createOpportunity(admin(), base(funder, { track: "funding", kind: "skills_lesson", stage: "identified" }))).rejects.toThrow();
    const id = await createOpportunity(admin(), base(funder, { track: "funding", kind: "grant", stage: "identified", title: "Spring grant" }));
    await expect(changeOpportunityStage(admin(), id, "committed")).rejects.toThrow();
    await changeOpportunityStage(admin(), id, "proposal_submitted");
    await changeOpportunityStage(admin(), id, "awarded");
    expect(await statusOf(funder)).toBe("active");

    const open = await listOpportunities(admin(), { personId: funder });
    expect(open).toHaveLength(0);
    const all = await listOpportunities(admin(), { personId: funder, state: "all", track: "funding" });
    expect(all.map((o) => o.stage)).toEqual(["awarded"]);
  });

  it("records the stage change made through the edit form, status unchanged", async () => {
    const person = await createPerson({ full_name: "Eddy Edit", status: "new" }, null);
    const id = await createOpportunity(admin(), base(person));
    await updateOpportunity(admin(), id, base(person, { title: "Sewing workshop, fall", stage: "committed", amount: "" }));
    const opp = await getOpportunity(admin(), id);
    expect(opp).toMatchObject({ title: "Sewing workshop, fall", stage: "committed", amount: null });
    expect(await statusOf(person)).toBe("new");
    const history = await getOpportunityHistory(admin(), id);
    expect(history[0]?.meta).toMatchObject({ from: "not_contacted", to: "committed" });
  });
});

describe("parseOpportunityForm", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  it("accepts a good form and rejects a stage from the other track", () => {
    const ok = parseOpportunityForm(form({ personId: "p1", track: "funding", kind: "grant", stage: "identified", title: " Grant ", capId: "none", targetDate: "2026-11-02" }));
    expect(ok).toEqual({
      ok: true,
      value: expect.objectContaining({ personId: "p1", track: "funding", title: "Grant", capId: null, targetDate: "2026-11-02" }),
    });
    const bad = parseOpportunityForm(form({ personId: "p1", track: "funding", kind: "grant", stage: "committed", title: "Grant" }));
    expect(bad).toEqual({ ok: false, errors: { stage: "crm.error.badChoice" } });
    const missing = parseOpportunityForm(form({ track: "engagement", kind: "other", stage: "contacted", title: "", targetDate: "2026-02-30" }));
    expect(missing).toEqual({
      ok: false,
      errors: { personId: "crm.error.personRequired", title: "crm.error.titleRequired", targetDate: "crm.error.badDate" },
    });
  });
});

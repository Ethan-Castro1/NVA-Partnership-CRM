import { beforeAll, describe, expect, it } from "vitest";
import { decidedIntakeName, getIntakeSubmission, listIntake } from "./admin.server";
import { newId, query } from "./db.server";
import { createPerson } from "./people.server";

/** Inserts a new sign-up with this payload and returns its id. */
async function signup(payload: Record<string, unknown>): Promise<string> {
  const id = newId();
  await query("INSERT INTO intake_submissions (id, payload, locale) VALUES ($1, $2, 'en')", [id, JSON.stringify(payload)]);
  return id;
}

const flagged = async (id: string) => (await listIntake("new")).rows.find((r) => r.id === id)?.possible_match;

beforeAll(async () => {
  await createPerson({ full_name: "José Pérez", email: "jose@example.org", phone: "(410) 555-0101", status: "active" }, null);
});

describe("the sign-up queue's Possible match flag", () => {
  it("uses the same rules as the review page: email, phone or name", async () => {
    const cases: [Record<string, unknown>, boolean][] = [
      [{ full_name: "Someone Else", email: "JOSE@example.org" }, true],
      [{ full_name: "Someone Else", phone: "+1 410 555 0101" }, true],
      [{ full_name: "  jose   perez " }, true],
      [{ full_name: "Brand New", email: "new@example.org", phone: "410 555 9999" }, false],
      [{ full_name: "Brand New", phone: "555" }, false],
    ];
    for (const [payload, expected] of cases) {
      const id = await signup(payload);
      expect(await flagged(id)).toBe(expected);
      // The review page agrees.
      expect(((await getIntakeSubmission(id))?.duplicates.length ?? 0) > 0).toBe(expected);
    }
  });
});

describe("naming who was decided", () => {
  it("reads ?done&from and returns that sign-up's name (edits win)", async () => {
    const id = await signup({ full_name: "Marcus Bell" });
    const req = (qs: string) => new Request(`http://x/app/admin/intake?${qs}`);
    expect(await decidedIntakeName(req(`done=approved&from=${id}`))).toBe("Marcus Bell");
    expect(await decidedIntakeName(req(`from=${id}`))).toBeNull();
    expect(await decidedIntakeName(req("done=approved&from=missing"))).toBeNull();
    await query("UPDATE intake_submissions SET edited_payload = $2 WHERE id = $1", [id, JSON.stringify({ full_name: "Marcus J. Bell" })]);
    expect(await decidedIntakeName(req(`done=approved&from=${id}`))).toBe("Marcus J. Bell");
  });
});

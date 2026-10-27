import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_ACCOUNTS, createUser, demoLogin, getUser, isDemoLoginEnabled, requireAdmin } from "./auth.server";
import { query } from "./db.server";

const request = (cookie?: string) => new Request("http://localhost/app", { headers: cookie ? { Cookie: cookie } : {} });
const cookieOf = (setCookie: string) => setCookie.split(";")[0];

beforeAll(async () => {
  await createUser({ email: DEMO_ACCOUNTS.admin, name: "Ashley", password: "long-enough-pw", role: "admin" });
  await createUser({ email: DEMO_ACCOUNTS.staff, name: "Taylor", password: "long-enough-pw", role: "staff" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demo sign-in", () => {
  it("is off unless DEMO_LOGIN or SEED_DEMO is set", async () => {
    vi.stubEnv("DEMO_LOGIN", "");
    vi.stubEnv("SEED_DEMO", "");
    expect(isDemoLoginEnabled()).toBe(false);
    expect(await demoLogin(request(), "admin")).toEqual({ ok: false, error: "auth.demoUnavailable" });
    vi.stubEnv("SEED_DEMO", "true");
    expect(isDemoLoginEnabled()).toBe(true);
  });

  it("starts a real session for the demo account of each role", async () => {
    vi.stubEnv("DEMO_LOGIN", "true");
    const asAdmin = await demoLogin(request(), "admin");
    expect(asAdmin.ok).toBe(true);
    if (!asAdmin.ok) return;
    expect(asAdmin.user).toMatchObject({ email: "admin@nva.test", role: "admin" });
    expect((await getUser(request(cookieOf(asAdmin.setCookie))))?.id).toBe(asAdmin.user.id);

    const asStaff = await demoLogin(request(), "staff");
    expect(asStaff.ok).toBe(true);
    if (!asStaff.ok) return;
    expect(asStaff.user).toMatchObject({ email: "teacher@nva.test", name: "Taylor", role: "staff" });
    const signedIn = request(cookieOf(asStaff.setCookie));
    expect((await getUser(signedIn))?.role).toBe("staff");

    // Staff get a 403 from admin pages, not the page.
    const denied = await requireAdmin(signedIn).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(403);
  });

  it("refuses when the demo account is missing, inactive or not that role", async () => {
    vi.stubEnv("DEMO_LOGIN", "true");
    expect(await demoLogin(request(), "nobody" as never)).toEqual({ ok: false, error: "auth.demoUnavailable" });
    await query("UPDATE users SET active = false WHERE email = $1", [DEMO_ACCOUNTS.staff]);
    expect(await demoLogin(request(), "staff")).toEqual({ ok: false, error: "auth.demoUnavailable" });
    await query("UPDATE users SET active = true, role = 'admin' WHERE email = $1", [DEMO_ACCOUNTS.staff]);
    expect(await demoLogin(request(), "staff")).toEqual({ ok: false, error: "auth.demoUnavailable" });
    await query("UPDATE users SET role = 'staff' WHERE email = $1", [DEMO_ACCOUNTS.staff]);
  });

  it("no longer lets anyone in without a session", async () => {
    vi.stubEnv("OPEN_ACCESS", "true");
    expect(await getUser(request())).toBeNull();
  });
});

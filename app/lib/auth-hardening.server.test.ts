/**
 * Sign-in hardening: no open redirects after login or a language switch, an
 * IP for rate limits that a client can't spoof, a lockout a stranger can't
 * use against someone else, shared demo accounts nobody can break, the demo
 * mode warning, and per-port session cookies in development.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { action as accountAction } from "~/routes/app.account";
import { action as usersAction } from "~/routes/app.admin.users";
import { action as langAction } from "~/routes/lang";
import { action as loginAction, loader as loginLoader } from "~/routes/login";
import {
  DEMO_ACCOUNTS,
  LOGIN_LIMITS,
  clientIp,
  createUser,
  demoLogin,
  getUser,
  isLockedDemoEmail,
  login,
  safeNext,
  sessionCookieName,
} from "./auth.server";
import { queryOne } from "./db.server";

const PASSWORD = "long-enough-pw";
let staffDemoId = "";
let adminDemoId = "";
let realStaffId = "";

beforeAll(async () => {
  adminDemoId = await createUser({ email: DEMO_ACCOUNTS.admin, name: "Ashley", password: PASSWORD, role: "admin" });
  staffDemoId = await createUser({ email: DEMO_ACCOUNTS.staff, name: "Taylor", password: PASSWORD, role: "staff" });
  realStaffId = await createUser({ email: "real.staff@example.org", name: "Rae", password: PASSWORD, role: "staff" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const cookieOf = (setCookie: string) => setCookie.split(";")[0];

function post(path: string, form: Record<string, string>, cookie?: string, origin = "http://localhost"): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: new URLSearchParams(form),
  });
}

async function demoCookie(role: "admin" | "staff"): Promise<string> {
  const result = await demoLogin(new Request("http://localhost/login"), role);
  if (!result.ok) throw new Error("demo login failed");
  return cookieOf(result.setCookie);
}

/** Status and body of a data() result or Response. */
function unwrap(value: unknown): { status: number; data: any } {
  if (value instanceof Response) return { status: value.status, data: null };
  const v = value as { data?: unknown; init?: { status?: number } };
  return { status: v.init?.status ?? 200, data: v.data };
}

describe("safeNext", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeNext("/app/people?q=sewing&page=2")).toBe("/app/people?q=sewing&page=2");
    expect(safeNext("/app/caps/abc#partners")).toBe("/app/caps/abc#partners");
    expect(safeNext("/app/people?q=a%20b")).toBe("/app/people?q=a%20b");
    expect(safeNext("/")).toBe("/");
  });

  it.each([
    ["tab", "/\t/evil.com"],
    ["newline", "/\n/evil.com"],
    ["carriage return", "/\r/evil.com"],
    ["space", "/ /evil.com"],
    ["null byte", "/\u0000/evil.com"],
    ["DEL", "/\u007f/evil.com"],
    ["slash backslash", "/\\evil.com"],
    ["backslash later", "/app\\..\\..\\evil.com"],
    ["protocol relative", "//evil.com"],
    ["protocol relative with path", "//evil.com/app"],
    ["absolute https", "https://evil.com"],
    ["absolute javascript", "javascript:alert(1)"],
    ["dot segments to //", "/a/..//evil.com"],
    ["dot to //", "/.//evil.com"],
    ["relative", "app"],
    ["empty", ""],
  ])("refuses %s", (_label, next) => {
    expect(safeNext(next)).toBe("/app");
    expect(safeNext(next, "/")).toBe("/");
  });

  it("handles null and undefined", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext(undefined, "/home")).toBe("/home");
  });
});

describe("redirect routes", () => {
  const demoNext = async (next: string) => {
    vi.stubEnv("DEMO_LOGIN", "true");
    const res = (await loginAction({ request: post("/login", { intent: "demo", role: "admin", next }), params: {}, context: {} } as never)) as Response;
    expect(res.status).toBe(302);
    return res.headers.get("Location");
  };

  it("login (demo buttons) only follows safe next paths", async () => {
    expect(await demoNext("/app/people?q=oysters")).toBe("/app/people?q=oysters");
    for (const bad of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\\evil.com", "//evil.com", "https://evil.com"])
      expect(await demoNext(bad)).toBe("/app");
  });

  it("login with a password only follows safe next paths", async () => {
    const res = (await loginAction({
      request: post("/login", { email: "real.staff@example.org", password: PASSWORD, next: "/\t/evil.com" }),
      params: {},
      context: {},
    } as never)) as Response;
    expect(res.headers.get("Location")).toBe("/app");
  });

  it("the login loader sends a signed-in user to a safe path, with no 500 on %0A", async () => {
    vi.stubEnv("DEMO_LOGIN", "true");
    const cookie = await demoCookie("admin");
    const visit = async (search: string) => {
      const request = new Request(`http://localhost/login?next=${search}`, { headers: { Cookie: cookie } });
      const thrown = await loginLoader({ request, params: {}, context: {} } as never).then(
        () => null,
        (e: unknown) => e,
      );
      expect(thrown).toBeInstanceOf(Response);
      return (thrown as Response).headers.get("Location");
    };
    expect(await visit("/%0A/evil.com")).toBe("/app");
    expect(await visit("/%09/evil.com")).toBe("/app");
    expect(await visit("/%0D/evil.com")).toBe("/app");
    expect(await visit("/%5Cevil.com")).toBe("/app");
    expect(await visit("//evil.com")).toBe("/app");
    expect(await visit("https%3A%2F%2Fevil.com")).toBe("/app");
    expect(await visit(encodeURIComponent("/app/people?q=sewing"))).toBe("/app/people?q=sewing");
  });

  it("the language switch only returns to safe paths", async () => {
    const back = async (redirectTo: string) => {
      const res = (await langAction({ request: post("/lang", { locale: "es", redirectTo }), params: {}, context: {} } as never)) as Response;
      return res.headers.get("Location");
    };
    expect(await back("/join?step=2")).toBe("/join?step=2");
    for (const bad of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\\evil.com", "//evil.com", "https://evil.com"])
      expect(await back(bad)).toBe("/");
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/login", { headers });

  it("never trusts the client-supplied first X-Forwarded-For entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("prefers x-real-ip, and x-vercel-forwarded-for only on Vercel", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("198.51.100.2");
    const headers = { "x-vercel-forwarded-for": "192.0.2.9", "x-real-ip": "198.51.100.2" };
    expect(clientIp(req(headers))).toBe("198.51.100.2");
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(req(headers))).toBe("192.0.2.9");
  });

  it("falls back to local", () => {
    expect(clientIp(req({}))).toBe("local");
  });
});

describe("login rate limits", () => {
  const from = (ip: string) => new Request("http://localhost/login", { method: "POST", headers: { "x-forwarded-for": `6.6.6.6, ${ip}` } });

  it("a stranger guessing locks only themselves out, not the real person elsewhere", async () => {
    await createUser({ email: "victim@example.org", name: "Vic", password: PASSWORD, role: "staff" });
    for (let i = 0; i < LOGIN_LIMITS.perEmailAndIp; i++)
      expect(await login(from("203.0.113.1"), "victim@example.org", "wrong-guess")).toMatchObject({ error: "auth.invalid" });
    // Even the right password is refused from the guessing address now...
    expect(await login(from("203.0.113.1"), "victim@example.org", PASSWORD)).toMatchObject({ ok: false, error: "auth.tooManyAttempts" });
    // ...and spoofing a new first X-Forwarded-For entry doesn't help.
    const spoofed = new Request("http://localhost/login", { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.1" } });
    expect(await login(spoofed, "victim@example.org", PASSWORD)).toMatchObject({ error: "auth.tooManyAttempts" });
    // The real person, somewhere else, still gets in.
    expect(await login(from("198.51.100.20"), "victim@example.org", PASSWORD)).toMatchObject({ ok: true });
  });

  it("still caps guesses at one account from many addresses", async () => {
    await createUser({ email: "target@example.org", name: "Tara", password: PASSWORD, role: "staff" });
    let n = 0;
    for (let ip = 1; n < LOGIN_LIMITS.perEmail; ip++)
      for (let i = 0; i < LOGIN_LIMITS.perEmailAndIp && n < LOGIN_LIMITS.perEmail; i++, n++)
        await login(from(`192.0.2.${ip}`), "target@example.org", "wrong-guess");
    expect(await login(from("198.51.100.99"), "target@example.org", PASSWORD)).toMatchObject({ error: "auth.tooManyAttempts" });
  });
});

describe("shared demo accounts", () => {
  it("are locked only while demo mode is on", () => {
    vi.stubEnv("DEMO_LOGIN", "");
    vi.stubEnv("SEED_DEMO", "");
    expect(isLockedDemoEmail(DEMO_ACCOUNTS.staff)).toBe(false);
    vi.stubEnv("SEED_DEMO", "true");
    expect(isLockedDemoEmail(" Teacher@NVA.test ")).toBe(true);
    expect(isLockedDemoEmail("real.staff@example.org")).toBe(false);
  });

  it("refuse a password change from My account in demo mode", async () => {
    vi.stubEnv("DEMO_LOGIN", "true");
    const cookie = await demoCookie("staff");
    const before = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [staffDemoId]);
    const result = unwrap(
      await accountAction({
        request: post("/app/account", { intent: "password", current: PASSWORD, next: "brand-new-password", confirm: "brand-new-password" }, cookie),
        params: {},
        context: {},
      } as never),
    );
    expect(result.status).toBe(400);
    expect(result.data).toMatchObject({ ok: false, form: "password", error: "account.error.demoLocked" });
    const after = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [staffDemoId]);
    expect(after?.password_hash).toBe(before?.password_hash);
    expect(await getUser(new Request("http://localhost/app", { headers: { Cookie: cookie } }))).not.toBeNull();
  });

  it("refuse role changes, deactivation and password resets on the admin users page", async () => {
    vi.stubEnv("DEMO_LOGIN", "true");
    const cookie = await demoCookie("admin");
    const send = async (form: Record<string, string>) =>
      unwrap(await usersAction({ request: post("/app/admin/users", form, cookie), params: {}, context: {} } as never));

    for (const form of <Record<string, string>[]>[
      { intent: "role", userId: staffDemoId, role: "admin" },
      { intent: "active", userId: staffDemoId, active: "false" },
      { intent: "reset", userId: staffDemoId, password: "another-long-password" },
      { intent: "reset", userId: adminDemoId, password: "another-long-password" },
    ]) {
      const result = await send(form);
      expect(result.status).toBe(403);
      expect(result.data).toEqual({ ok: false, error: "admin.error.demoAccount" });
    }
    const row = await queryOne<{ role: string; active: boolean }>("SELECT role, active FROM users WHERE id = $1", [staffDemoId]);
    expect(row).toEqual({ role: "staff", active: true });

    // Other accounts work as usual.
    expect((await send({ intent: "active", userId: realStaffId, active: "false" })).data).toMatchObject({ ok: true, done: "deactivated" });
    expect((await send({ intent: "active", userId: realStaffId, active: "true" })).data).toMatchObject({ ok: true, done: "reactivated" });
  });

  it("can change their password when demo mode is off", async () => {
    vi.stubEnv("DEMO_LOGIN", "true");
    const cookie = await demoCookie("staff");
    vi.stubEnv("DEMO_LOGIN", "");
    vi.stubEnv("SEED_DEMO", "");
    const result = unwrap(
      await accountAction({
        request: post("/app/account", { intent: "password", current: PASSWORD, next: "brand-new-password", confirm: "brand-new-password" }, cookie),
        params: {},
        context: {},
      } as never),
    );
    expect(result.data).toEqual({ ok: true, done: "password" });
  });
});

describe("demo mode warning", () => {
  it("warns once at startup when demo login is on", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("SEED_DEMO", "true");
    delete (globalThis as { __nvaDemoWarned?: boolean }).__nvaDemoWarned;
    vi.resetModules();
    await import("./auth.server");
    vi.resetModules();
    await import("./auth.server");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("Demo login is ON");
    warn.mockRestore();
  });

  it("stays quiet when demo login is off", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("DEMO_LOGIN", "");
    vi.stubEnv("SEED_DEMO", "");
    delete (globalThis as { __nvaDemoWarned?: boolean }).__nvaDemoWarned;
    vi.resetModules();
    await import("./auth.server");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("session cookie name", () => {
  it("carries the port in development so local servers don't sign each other out", async () => {
    expect(sessionCookieName(new Request("http://localhost:5351/app"))).toBe("nva_session_5351");
    expect(sessionCookieName(new Request("http://localhost/app"))).toBe("nva_session");

    vi.stubEnv("DEMO_LOGIN", "true");
    const result = await demoLogin(new Request("http://localhost:5351/login"), "staff");
    if (!result.ok) throw new Error("demo login failed");
    const cookie = cookieOf(result.setCookie);
    expect(cookie.startsWith("nva_session_5351=")).toBe(true);
    expect(await getUser(new Request("http://localhost:5351/app", { headers: { Cookie: cookie } }))).not.toBeNull();
    expect(await getUser(new Request("http://localhost:5352/app", { headers: { Cookie: cookie } }))).toBeNull();
  });

  it("stays __Host-nva_session in production, whatever the port", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const prod = await import("./auth.server");
    expect(prod.sessionCookieName(new Request("https://village.example.org:8443/app"))).toBe("__Host-nva_session");
    expect(prod.sessionCookieName(new Request("https://village.example.org/app"))).toBe("__Host-nva_session");
  });
});

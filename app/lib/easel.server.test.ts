/**
 * What running on Easel (Playlab's lab school hosting) needs: Sign in with
 * Playlab instead of passwords, a schema the deploy applies (not the server),
 * no embedded database in production, and the MCP connector off by default.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loader as healthcheck } from "~/routes/healthcheck";
import { loader as loginLoader } from "~/routes/login";
import { loader as mcpLoader } from "~/routes/mcp.$key";
import { createUser, isDemoLoginEnabled, login } from "./auth.server";
import { migrateDatabase, query, queryOne, requireSchema } from "./db.server";
import { isMcpConnectorEnabled } from "./mcp-keys.server";
import { accountForPlaylabUser } from "./playlab-sign-in.server";

const PASSWORD = "a-long-password-1";

afterEach(() => {
  vi.unstubAllEnvs();
});

function playlabOn() {
  vi.stubEnv("PLAYLAB_URL", "https://playlab.example");
  vi.stubEnv("PLAYLAB_CLIENT_ID", "client");
  vi.stubEnv("PLAYLAB_CLIENT_SECRET", "x".repeat(32));
}

describe("Sign in with Playlab", () => {
  let ana: string;
  beforeAll(async () => {
    ana = await createUser({ email: "ana@nva.test", name: "Ana Admin", role: "admin" });
    await createUser({ email: "old@nva.test", name: "Old Staff", role: "staff" });
    await query("UPDATE users SET active = false WHERE email = 'old@nva.test'");
  });

  it("links an invited account by verified email, then matches on the Playlab id", async () => {
    const first = await accountForPlaylabUser({ sub: "pl-ana", email: "Ana@NVA.test", email_verified: true });
    expect(first).toMatchObject({ id: ana, role: "admin" });
    // Later sign-ins match on the id, even if the Playlab email changes.
    expect(await accountForPlaylabUser({ sub: "pl-ana", email: "ana.new@example.org", email_verified: true })).toMatchObject({ id: ana });
    // Another Playlab user with the same email can't take over the linked account.
    expect(await accountForPlaylabUser({ sub: "pl-other", email: "ana@nva.test", email_verified: true })).toBe("auth.playlab.notInvited");
  });

  it("turns away unverified emails, people nobody invited, deactivated accounts and students", async () => {
    expect(await accountForPlaylabUser({ sub: "pl-x", email: "old@nva.test", email_verified: false })).toBe("auth.playlab.unverified");
    expect(await accountForPlaylabUser({ sub: "pl-y", email: "stranger@example.org", email_verified: true })).toBe(
      "auth.playlab.notInvited",
    );
    expect(await accountForPlaylabUser({ sub: "pl-z", email: "old@nva.test", email_verified: true })).toBe("auth.playlab.notInvited");
    expect(await accountForPlaylabUser({ sub: "pl-ana", attested_role: "student" })).toBe("auth.playlab.student");
  });

  it("accounts made without a password can't sign in with one, and passwords are off once Playlab sign-in is on", async () => {
    const req = new Request("http://localhost/login", { method: "POST" });
    expect(await login(req, "ana@nva.test", "playlab-sign-in")).toMatchObject({ ok: false, error: "auth.invalid" });

    await createUser({ email: "pw@nva.test", name: "Pat", role: "staff", password: PASSWORD });
    playlabOn();
    expect(await login(req, "pw@nva.test", PASSWORD)).toEqual({ ok: false, error: "auth.usePlaylab" });
  });

  it("/login offers Playlab and shows only known error keys", async () => {
    playlabOn();
    const page = async (search: string) =>
      (await loginLoader({ request: new Request(`http://localhost/login${search}`), params: {}, context: {} } as never)) as {
        playlab: boolean;
        playlabError: string | null;
      };
    expect(await page("?error=auth.playlab.notInvited")).toMatchObject({ playlab: true, playlabError: "auth.playlab.notInvited" });
    expect((await page("?error=<script>")).playlabError).toBeNull();
  });
});

describe("the schema on Easel", () => {
  it("the server's check passes once migrations ran, and names what's missing otherwise", async () => {
    await migrateDatabase();
    await expect(requireSchema({ query })).resolves.toBeUndefined();

    const fresh = { query: async () => [{ ok: false }] as never[] };
    await expect(requireSchema(fresh)).rejects.toThrow(/Run npm run db:migrate/);
  });

  it("production refuses to start without DATABASE_URL instead of using a database on the pod's disk", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PGLITE_DIR", "");
    vi.resetModules();
    const fresh = await import("./db.server");
    await expect(fresh.migrateDatabase()).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("the health check answers 200 when the database works", async () => {
    const response = await healthcheck();
    expect(response.status).toBe(200);
  });

  it("an existing database gets the playlab_id column", async () => {
    expect(await queryOne("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'playlab_id'")).not.toBeNull();
  });
});

describe("the MCP connector", () => {
  it("is off unless MCP_CONNECTOR=true", async () => {
    expect(isMcpConnectorEnabled()).toBe(false);
    const response = (await mcpLoader({ request: new Request("http://localhost/mcp/nva_x"), params: { key: "nva_x" }, context: {} } as never)) as Response;
    expect(response.status).toBe(404);
    vi.stubEnv("MCP_CONNECTOR", "true");
    expect(isMcpConnectorEnabled()).toBe(true);
  });
});

describe("the Vercel demo", () => {
  it("has demo sign-in on unless DEMO_LOGIN=false; Easel (no VERCEL) never does by default", () => {
    vi.stubEnv("DEMO_LOGIN", "");
    vi.stubEnv("SEED_DEMO", "");
    vi.stubEnv("VERCEL", "");
    expect(isDemoLoginEnabled()).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(isDemoLoginEnabled()).toBe(true);
    vi.stubEnv("DEMO_LOGIN", "false");
    expect(isDemoLoginEnabled()).toBe(false);
  });
});

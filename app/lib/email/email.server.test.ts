/**
 * Email integration and AI drafts: token encryption, admin-only access, drafts
 * grounded only in stored facts, and no sending without explicit approval.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as callbackRoute from "~/routes/app.admin.email.callback";
import * as connectRoute from "~/routes/app.admin.email.connect.$provider";
import * as settingsEmailRoute from "~/routes/app.admin.settings.email";
import * as settingsRoute from "~/routes/app.admin.settings._index";
import * as communicationsRoute from "~/routes/app.communications";
import * as personEmailRoute from "~/routes/app.people.$personId.email";
import { buildDraftPrompt, gatherDraftFacts, generateDraft, unsupportedFigures, type DraftModel } from "../ai/drafts.server";
import { createUser, login } from "../auth.server";
import { query } from "../db.server";
import { recordHistory } from "../history.server";
import { createPerson } from "../people.server";
import type { SessionUser } from "../types";
import { saveConnectedAccount } from "./accounts.server";
import { emailSetup } from "./config.server";
import { decryptToken, encryptToken, parseTokenKey } from "./crypto.server";
import { createFollowUpAfterSend } from "./follow-up.server";
import { buildMime, cleanSnippet, parseAddresses } from "./mime";
import { sendDraft } from "./send.server";
import { createDraft, getDraft } from "./store.server";
import { matchContacts, pruneOldMessages, syncAccount } from "./sync.server";

const KEY = randomBytes(32).toString("base64");
const PASSWORD = "long-enough-pw";
const BASE = "http://localhost:5306";

let admin: SessionUser;
let adminCookie = "";
let staffCookie = "";
let dana: string;
let other: string;

const cookieOf = (setCookie: string) => setCookie.split(";")[0];
const req = (path: string, cookie: string, init: RequestInit = {}) =>
  new Request(`${BASE}${path}`, { ...init, headers: { Cookie: cookie, ...(init.headers as Record<string, string> | undefined) } });
const post = (path: string, cookie: string, fields: Record<string, string>) =>
  req(path, cookie, { method: "POST", body: new URLSearchParams(fields), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
const args = (request: Request, params: Record<string, string> = {}) => ({ request, params, context: {} }) as never;

async function thrown(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    return error;
  }
}

function configure() {
  vi.stubEnv("EMAIL_TOKEN_KEY", KEY);
  vi.stubEnv("APP_URL", "https://partners.example.org");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id-value");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret-value");
  vi.stubEnv("DEMO_LOGIN", "");
  vi.stubEnv("SEED_DEMO", "");
}

/** A fake Google: token, profile, send, list and get. Records every call. */
function fakeGoogle(messages: { id: string; from: string; to: string; subject: string; snippet: string; labels?: string[]; at?: number }[] = []) {
  const calls: { url: string; body: string }[] = [];
  const fn = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return json({ access_token: "access-1", refresh_token: body.includes("authorization_code") ? "refresh-1" : undefined, scope: "s1 s2" });
    }
    if (url.endsWith("/users/me/profile")) return json({ emailAddress: "office@nva.example.org" });
    if (url.endsWith("/messages/send")) return json({ id: "gm-sent-1", threadId: "th-1" });
    if (url.includes("/users/me/messages?")) return json({ messages: messages.map((m) => ({ id: m.id })) });
    const match = url.match(/\/users\/me\/messages\/([^?]+)\?/);
    if (match) {
      const m = messages.find((x) => x.id === decodeURIComponent(match[1]))!;
      return json({
        id: m.id,
        threadId: `t-${m.id}`,
        labelIds: m.labels ?? ["INBOX"],
        snippet: m.snippet,
        internalDate: String(m.at ?? Date.now() - 86_400_000),
        payload: { headers: [{ name: "From", value: m.from }, { name: "To", value: m.to }, { name: "Subject", value: m.subject }] },
      });
    }
    return json({ error: "not_found" }, 404);
  });
  return { fn, calls };
}

beforeAll(async () => {
  const adminId = await createUser({ email: "u6-admin@test", name: "Ashley Admin", password: PASSWORD, role: "admin" });
  await createUser({ email: "u6-staff@test", name: "Sam Staff", password: PASSWORD, role: "staff" });
  admin = { id: adminId, email: "u6-admin@test", name: "Ashley Admin", role: "admin", locale: "en" };
  const a = await login(new Request(BASE), "u6-admin@test", PASSWORD);
  const s = await login(new Request(BASE), "u6-staff@test", PASSWORD);
  if (!a.ok || !s.ok) throw new Error("login failed");
  adminCookie = cookieOf(a.setCookie);
  staffCookie = cookieOf(s.setCookie);

  dana = await createPerson(
    {
      full_name: "Dana Whitfield",
      email: "dana@example.org",
      title: "Program Officer",
      organization_name: "Chesapeake Youth Futures Fund (demo)",
      contribution_types: ["funder"],
      notes: "Met at the Launchpad Innovation Center reception.",
      funding_focus: "Youth internships. Grants of $10,000 to $50,000.",
      status: "active",
    },
    adminId,
  );
  other = await createPerson({ full_name: "Olive Other", email: "olive@example.org", notes: "SECRET-OTHER-NOTE zebra", status: "active" }, adminId);
  await recordHistory(
    { personId: dana, kind: "meeting", origin: "manual", visibility: "admin", userId: adminId, happenedOn: "2026-10-13", notes: "Coffee; she asked for placement numbers." },
  );
  await query(
    `INSERT INTO opportunities (id, person_id, track, kind, title, stage, amount, created_by)
     VALUES ('opp-u6', $1, 'funding', 'grant', 'Youth Futures internship grant', 'cultivating', '$25,000', $2)`,
    [dana, adminId],
  );
});

beforeEach(() => configure());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("token encryption", () => {
  it("round-trips and refuses a wrong key or a changed byte", () => {
    const key = parseTokenKey(KEY)!;
    const sealed = encryptToken("1//refresh-token-value", key);
    expect(sealed).not.toContain("refresh-token-value");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptToken(sealed, key)).toBe("1//refresh-token-value");
    // Same input, different output (random IV).
    expect(encryptToken("1//refresh-token-value", key)).not.toBe(sealed);
    expect(() => decryptToken(sealed, randomBytes(32))).toThrow();
    const parts = sealed.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 1;
    expect(() => decryptToken([...parts.slice(0, 3), flipped.toString("base64url")].join("."), key)).toThrow();
  });

  it("accepts 32-byte keys in hex or base64 only", () => {
    expect(parseTokenKey(randomBytes(32).toString("hex"))?.length).toBe(32);
    expect(parseTokenKey(randomBytes(32).toString("base64url"))?.length).toBe(32);
    expect(parseTokenKey("too-short")).toBeNull();
    expect(parseTokenKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseTokenKey("")).toBeNull();
  });

  it("stores refresh tokens encrypted at rest", async () => {
    const id = await saveConnectedAccount({ provider: "google", emailAddress: "enc-check@nva.example.org", refreshToken: "plain-refresh-xyz", scopes: [], connectedBy: admin.id });
    const [row] = await query<{ refresh_token_enc: string }>("SELECT refresh_token_enc FROM email_accounts WHERE id = $1", [id]);
    expect(row.refresh_token_enc).not.toContain("plain-refresh-xyz");
    expect(decryptToken(row.refresh_token_enc)).toBe("plain-refresh-xyz");
    await query("DELETE FROM email_accounts WHERE id = $1", [id]);
  });
});

describe("setup checklist", () => {
  it("names what is missing and never includes values", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("MS_CLIENT_ID", "");
    vi.stubEnv("MS_CLIENT_SECRET", "");
    vi.stubEnv("EMAIL_TOKEN_KEY", "not-a-key");
    const setup = emailSetup();
    expect(setup.shared).toEqual([
      { name: "EMAIL_TOKEN_KEY", state: "invalid" },
      { name: "APP_URL", state: "set" },
    ]);
    expect(setup.providers.find((p) => p.provider === "google")?.settings).toEqual([
      { name: "GOOGLE_CLIENT_ID", state: "set" },
      { name: "GOOGLE_CLIENT_SECRET", state: "missing" },
    ]);
    expect(setup.anyReady).toBe(false);
    expect(setup.redirectUri).toBe("https://partners.example.org/app/admin/email/callback");

    const page = await settingsEmailRoute.loader(args(req("/app/admin/settings/email", adminCookie)));
    const text = JSON.stringify(page);
    expect(text).toContain("GOOGLE_CLIENT_SECRET");
    expect(text).not.toContain("google-client-id-value");
    expect(text).not.toContain("not-a-key");
  });
});

describe("admin only", () => {
  it("gives staff a 403 on every email, settings and communications route", async () => {
    const expect403 = async (fn: () => Promise<unknown>) => {
      const result = await thrown(fn);
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(403);
    };
    const params = { personId: dana };
    await expect403(() => settingsRoute.loader(args(req("/app/admin/settings", staffCookie))));
    await expect403(() => settingsEmailRoute.loader(args(req("/app/admin/settings/email", staffCookie))));
    await expect403(() => settingsEmailRoute.action(args(post("/app/admin/settings/email", staffCookie, { intent: "sync" }))));
    await expect403(() => communicationsRoute.loader(args(req("/app/communications", staffCookie))));
    await expect403(() => communicationsRoute.action(args(post("/app/communications", staffCookie, { intent: "sync" }))));
    await expect403(() => personEmailRoute.loader(args(req(`/app/people/${dana}/email`, staffCookie), params)));
    await expect403(() =>
      personEmailRoute.action(args(post(`/app/people/${dana}/email`, staffCookie, { intent: "blank" }), params)),
    );
    await expect403(() => connectRoute.action(args(post("/app/admin/email/connect/google", staffCookie, {}), { provider: "google" })));
    await expect403(() => callbackRoute.loader(args(req("/app/admin/email/callback?code=x&state=y", staffCookie))));
    // And staff made no drafts.
    expect(await query("SELECT 1 FROM email_drafts WHERE person_id = $1", [dana])).toHaveLength(0);
  });

  it("renders the compose page for an admin", async () => {
    const page = (await personEmailRoute.loader(args(req(`/app/people/${dana}/email`, adminCookie), { personId: dana }))) as {
      person: { full_name: string };
      to: string | null;
      sendBlock: string | null;
    };
    expect(page.person.full_name).toBe("Dana Whitfield");
    expect(page.to).toBe("dana@example.org");
    expect(page.sendBlock).toBe("noMailbox");
  });
});

describe("AI drafts", () => {
  it("prompts with only stored facts about this contact", async () => {
    let seen: { system: string; prompt: string } | null = null;
    const model: DraftModel = async (input) => {
      seen = input;
      return {
        subject: "Internship overview for the Youth Futures grant",
        body: "Dear Dana,\n\nThank you for the coffee. Here is the overview — we can share $25,000 plans and $99,000 more.\n\nAshley Admin",
        facts_used: ["F2", "F99"],
        flags: ["Add the placement numbers."],
      };
    };
    const outcome = await generateDraft(
      { personId: dana, admin, purpose: "funding_follow_up", statedPurpose: "Send the internship overview she asked for.", language: "en" },
      model,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !seen) return;
    const { system, prompt } = seen as { system: string; prompt: string };

    // The facts in the prompt are exactly what NVA has stored about Dana.
    const facts = await gatherDraftFacts(dana, admin);
    const factsJson = prompt.slice(prompt.indexOf("FACTS (JSON):\n") + "FACTS (JSON):\n".length);
    expect(JSON.parse(factsJson)).toEqual(facts);
    const texts = facts!.map((f) => f.text).join("\n");
    for (const stored of [
      "Dana Whitfield",
      "Program Officer",
      "Chesapeake Youth Futures Fund (demo)",
      "Launchpad Innovation Center",
      "Grants of $10,000 to $50,000",
      "Coffee; she asked for placement numbers.",
      "Youth Futures internship grant",
      "$25,000",
      "Ashley Admin",
    ]) {
      expect(texts).toContain(stored);
    }
    // Nothing about anyone else, and the only other input is the stated purpose.
    expect(prompt).not.toContain("SECRET-OTHER-NOTE");
    expect(prompt).not.toContain("Olive");
    expect(prompt.slice(0, prompt.indexOf("FACTS (JSON):"))).toContain("Send the internship overview she asked for.");
    expect(system).toMatch(/Use only the FACTS/);
    expect(system).toMatch(/Never make commitments/);
    expect(prompt).toBe(buildDraftPrompt({ purpose: "funding_follow_up", statedPurpose: "Send the internship overview she asked for.", language: "en", facts: facts! }).prompt);

    // Unknown fact ids are dropped; a figure no fact contains is flagged; em dashes are removed.
    expect(outcome.factsUsed.map((f) => f.id)).toEqual(["F2"]);
    expect(outcome.flags).toContain("figure:$99,000");
    expect(outcome.flags).not.toContain("figure:$25,000");
    expect(outcome.body).not.toContain("—");
  });

  it("says AI is off instead of inventing a draft", async () => {
    expect(await generateDraft({ personId: dana, admin, purpose: "thank_you", language: "en" })).toEqual({ ok: false, error: "notConfigured" });
  });

  it("flags figures that aren't in the records", () => {
    expect(unsupportedFigures("We need 12 students and $5,000 by 2026.", ["2026 plans", "$5,000 grant"])).toEqual(["figure:12"]);
  });
});

describe("sending", () => {
  let accountId: string;

  beforeAll(async () => {
    vi.stubEnv("EMAIL_TOKEN_KEY", KEY);
    accountId = await saveConnectedAccount({ provider: "google", emailAddress: "office@nva.example.org", refreshToken: "refresh-1", scopes: [], connectedBy: admin.id });
    vi.unstubAllEnvs();
  });

  it("never sends without explicit approval", async () => {
    const google = fakeGoogle();
    vi.stubGlobal("fetch", google.fn);
    const draftId = await createDraft({ personId: dana, authorId: admin.id, purpose: "follow_up", subject: "Hello", body: "Hi Dana", aiGenerated: true });

    expect(await sendDraft({ draftId, personId: dana, admin, approved: false, fetchFn: google.fn })).toEqual({ ok: false, error: "notApproved" });
    // The page's Send without the confirmation's approve field: refused, nothing sent.
    const response = (await personEmailRoute.action(
      args(post(`/app/people/${dana}/email`, adminCookie, { intent: "send", draftId, subject: "Hello", body: "Hi Dana" }), { personId: dana }),
    )) as { init?: { status?: number }; data?: unknown };
    expect(JSON.stringify(response)).toContain("email.error.notApproved");
    expect(google.fn).not.toHaveBeenCalled();
    expect((await getDraft(draftId, dana))?.status).toBe("draft");
    expect(await query("SELECT 1 FROM email_messages WHERE account_id = $1", [accountId])).toHaveLength(0);

    // Demo mode refuses even with approval.
    vi.stubEnv("DEMO_LOGIN", "true");
    expect(await sendDraft({ draftId, personId: dana, admin, approved: true, fetchFn: google.fn })).toEqual({ ok: false, error: "demo" });
    expect(google.fn).not.toHaveBeenCalled();
  });

  it("sends on approval, records history and offers a follow-up", async () => {
    const google = fakeGoogle();
    const draftId = await createDraft({ personId: dana, authorId: admin.id, purpose: "follow_up", subject: "Placement numbers", body: "Hi Dana,\nHere they are.", aiGenerated: true });
    const result = await sendDraft({ draftId, personId: dana, admin, approved: true, fetchFn: google.fn });
    expect(result).toMatchObject({ ok: true, to: "dana@example.org" });
    if (!result.ok) return;

    const sendCall = google.calls.find((c) => c.url.endsWith("/messages/send"))!;
    const raw = Buffer.from(JSON.parse(sendCall.body).raw, "base64url").toString("utf8");
    expect(raw).toContain("To: dana@example.org");
    expect(raw).toContain("Subject: Placement numbers");

    expect((await getDraft(draftId, dana))?.status).toBe("sent");
    const history = await query<{ kind: string; origin: string; visibility: string; notes: string }>(
      "SELECT kind, origin, visibility, notes FROM engagements WHERE email_message_id = $1",
      [result.messageId],
    );
    expect(history).toEqual([{ kind: "email_sent", origin: "email", visibility: "admin", notes: "Placement numbers" }]);

    const followUp = await createFollowUpAfterSend({ personId: dana, action: "Check for a reply", dueOn: "2026-11-03", awaitingResponse: true, userId: admin.id, emailMessageId: result.messageId });
    expect(followUp.ok).toBe(true);
    const rows = await query<{ status: string; awaiting_response: boolean }>("SELECT status, awaiting_response FROM follow_ups WHERE person_id = $1", [dana]);
    expect(rows).toEqual([{ status: "open", awaiting_response: true }]);
    expect(await createFollowUpAfterSend({ personId: dana, action: " ", dueOn: "2026-11-03", awaitingResponse: false, userId: admin.id })).toEqual({ ok: false, error: "actionRequired" });
  });

  it("syncs only mail with known contacts, once, and keeps subject and snippet only", async () => {
    const google = fakeGoogle([
      { id: "in-1", from: "Dana Whitfield <dana@example.org>", to: "office@nva.example.org", subject: "Re: Placement numbers", snippet: "Thanks &amp; see you soon" },
      { id: "in-2", from: "stranger@example.com", to: "office@nva.example.org", subject: "Spam", snippet: "x" },
      { id: "gm-sent-1", from: "office@nva.example.org", to: "dana@example.org", subject: "Placement numbers", snippet: "Hi Dana", labels: ["SENT"] },
    ]);
    const first = await syncAccount(accountId, { fetchFn: google.fn });
    expect(first).toEqual({ ok: true, added: 1 });
    const again = await syncAccount(accountId, { fetchFn: google.fn });
    expect(again).toEqual({ ok: true, added: 0 });

    const stored = await query<{ subject: string; snippet: string; direction: string }>(
      "SELECT subject, snippet, direction FROM email_messages WHERE provider_message_id = 'in-1'",
    );
    expect(stored).toEqual([{ subject: "Re: Placement numbers", snippet: "Thanks & see you soon", direction: "received" }]);
    expect(await query("SELECT 1 FROM email_messages WHERE subject = 'Spam'")).toHaveLength(0);
    const received = await query("SELECT 1 FROM engagements WHERE person_id = $1 AND kind = 'email_received' AND origin = 'email'", [dana]);
    expect(received).toHaveLength(1);
  });

  it("drops synced mail older than 12 months", async () => {
    await query(
      `INSERT INTO email_messages (id, account_id, provider_message_id, direction, subject, sent_at, sent_via_app)
       VALUES ('old-1', $1, 'old-1', 'received', 'Old', now() - interval '13 months', FALSE)`,
      [accountId],
    );
    expect(await pruneOldMessages()).toBe(1);
    expect(await query("SELECT 1 FROM email_messages WHERE id = 'old-1'")).toHaveLength(0);
  });
});

describe("OAuth connect", () => {
  it("starts with state and PKCE, and rejects a callback whose state doesn't match", async () => {
    const response = (await connectRoute.action(args(post("/app/admin/email/connect/google", adminCookie, {}), { provider: "google" }))) as Response;
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("redirect_uri")).toBe("https://partners.example.org/app/admin/email/callback");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("access_type")).toBe("offline");
    const state = location.searchParams.get("state")!;
    const handshake = cookieOf(response.headers.get("Set-Cookie")!);
    expect(handshake).not.toContain(state);

    const bad = (await callbackRoute.loader(args(req(`/app/admin/email/callback?code=c&state=wrong`, `${adminCookie}; ${handshake}`)))) as Response;
    expect(bad.headers.get("Location")).toBe("/app/admin/settings/email?error=state");

    const google = fakeGoogle();
    vi.stubGlobal("fetch", google.fn);
    const good = (await callbackRoute.loader(args(req(`/app/admin/email/callback?code=c&state=${state}`, `${adminCookie}; ${handshake}`)))) as Response;
    expect(good.headers.get("Location")).toBe("/app/admin/settings/email?connected=google");
    expect(google.calls[0].body).toContain("code_verifier=");
  });

  it("refuses to start when a setting is missing or in demo mode", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const missing = (await connectRoute.action(args(post("/app/admin/email/connect/google", adminCookie, {}), { provider: "google" }))) as Response;
    expect(missing.headers.get("Location")).toBe("/app/admin/settings/email?error=notConfigured");
    configure();
    vi.stubEnv("DEMO_LOGIN", "true");
    const demo = (await connectRoute.action(args(post("/app/admin/email/connect/google", adminCookie, {}), { provider: "google" }))) as Response;
    expect(demo.headers.get("Location")).toBe("/app/admin/settings/email?error=demo");
    const unknown = await thrown(() => connectRoute.action(args(post("/app/admin/email/connect/yahoo", adminCookie, {}), { provider: "yahoo" })));
    expect((unknown as Response).status).toBe(404);
  });
});

describe("mime and matching", () => {
  it("builds a plain-text message and blocks header injection", () => {
    const raw = buildMime({ from: "office@nva.org", to: ["dana@example.org"], subject: "Hola\r\nBcc: evil@x.com", body: "Línea uno" });
    expect(raw).not.toMatch(/\r\nBcc:/);
    expect(raw).toContain("Subject: Hola Bcc: evil@x.com");
    const accented = buildMime({ from: "a@b.org", to: ["c@d.org"], subject: "Reunión", body: "x" });
    expect(accented).toContain("Subject: =?UTF-8?B?");
    expect(() => buildMime({ from: "a@b.org", to: ["not an address"], subject: "s", body: "b" })).toThrow();
  });

  it("parses addresses and matches contacts but not the mailbox itself", () => {
    expect(parseAddresses('"Whitfield, Dana" <Dana@Example.org>, bo@y.org')).toEqual(["dana@example.org", "bo@y.org"]);
    const contacts = new Map([["dana@example.org", [dana]], ["office@nva.example.org", [other]]]);
    expect(matchContacts({ from: "office@nva.example.org", to: ["dana@example.org"], cc: [] }, contacts, "office@nva.example.org")).toEqual([dana]);
    expect(cleanSnippet("a&#39;b   c")).toBe("a'b c");
  });
});

/**
 * Google (Gmail API) and Microsoft 365 (Microsoft Graph) over plain fetch.
 *
 * OAuth 2.0 authorization code flow with PKCE. The app asks for permission to
 * send mail and to read message headers and previews; it keeps only subject
 * and snippet (no bodies, no attachments). Errors never carry token values.
 */
import { createHash, randomBytes } from "node:crypto";
import { oauthClient, type EmailProvider } from "./config.server";
import { buildMime, cleanSnippet, parseAddresses, type OutgoingEmail } from "./mime";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const SCOPES: Record<EmailProvider, string[]> = {
  google: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
  microsoft: ["offline_access", "User.Read", "Mail.Read", "Mail.Send"],
};

/** "auth": the token was revoked or expired (reconnect). "busy": try later. "failed": anything else. */
export class ProviderError extends Error {
  constructor(
    public readonly kind: "auth" | "busy" | "failed",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type TokenSet = { accessToken: string; refreshToken: string | null; scopes: string[] };

export type SyncedMessage = {
  providerMessageId: string;
  threadId: string | null;
  direction: "sent" | "received";
  from: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  snippet: string | null;
  sentAt: Date;
};

export type ListInput = {
  /** Only messages after this moment. */
  since: Date;
  /** Lowercased addresses of known contacts. */
  contactEmails: string[];
  /** The connected mailbox's own address (to tell sent from received). */
  accountEmail: string;
  /** Most messages to read in one run. */
  limit: number;
};

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

function classify(status: number, oauthError?: string): ProviderError["kind"] {
  if (status === 401 || oauthError === "invalid_grant" || oauthError === "unauthorized_client") return "auth";
  if (status === 429 || status >= 500) return "busy";
  return "failed";
}

async function call<T>(fetchFn: FetchLike, url: string, init: RequestInit, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new ProviderError("busy", 0, `${what}: network error`);
  }
  if (!response.ok) {
    let oauthError: string | undefined;
    try {
      const body = (await response.json()) as { error?: unknown };
      oauthError = typeof body.error === "string" ? body.error : undefined;
    } catch {
      // Not JSON; the status is enough.
    }
    // Only the status and the OAuth error code: never response bodies, which can echo request values.
    throw new ProviderError(classify(response.status, oauthError), response.status, `${what}: HTTP ${response.status}${oauthError ? ` (${oauthError})` : ""}`);
  }
  if (response.status === 202 || response.status === 204) return {} as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const form = (values: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(values).toString(),
});
const bearer = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

type TokenResponse = { access_token?: string; refresh_token?: string; scope?: string };
function tokenSet(body: TokenResponse, requested: string[]): TokenSet {
  if (!body.access_token) throw new ProviderError("failed", 200, "token: no access token");
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, scopes: body.scope ? body.scope.split(" ") : requested };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export type ProviderApi = {
  authUrl(input: { state: string; codeChallenge: string }): string;
  exchangeCode(code: string, codeVerifier: string, fetchFn?: FetchLike): Promise<TokenSet>;
  refresh(refreshToken: string, fetchFn?: FetchLike): Promise<TokenSet>;
  accountEmail(accessToken: string, fetchFn?: FetchLike): Promise<string>;
  send(accessToken: string, email: OutgoingEmail, fetchFn?: FetchLike): Promise<{ providerMessageId: string; threadId: string | null }>;
  listMessages(accessToken: string, input: ListInput, fetchFn?: FetchLike): Promise<SyncedMessage[]>;
  /** Best effort: tell the provider to forget the token. */
  revoke(refreshToken: string, fetchFn?: FetchLike): Promise<void>;
};

// ---------- Google (Gmail API) ----------

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

const google: ProviderApi = {
  authUrl({ state, codeChallenge }) {
    const client = oauthClient("google");
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: "code",
      scope: SCOPES.google.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${GOOGLE_AUTH}?${params}`;
  },
  async exchangeCode(code, codeVerifier, fetchFn = fetch) {
    const client = oauthClient("google");
    const body = await call<TokenResponse>(
      fetchFn,
      GOOGLE_TOKEN,
      form({
        code,
        code_verifier: codeVerifier,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: client.redirectUri,
        grant_type: "authorization_code",
      }),
      "google token",
    );
    return tokenSet(body, SCOPES.google);
  },
  async refresh(refreshToken, fetchFn = fetch) {
    const client = oauthClient("google");
    const body = await call<TokenResponse>(
      fetchFn,
      GOOGLE_TOKEN,
      form({ refresh_token: refreshToken, client_id: client.clientId, client_secret: client.clientSecret, grant_type: "refresh_token" }),
      "google refresh",
    );
    return tokenSet(body, SCOPES.google);
  },
  async accountEmail(accessToken, fetchFn = fetch) {
    const profile = await call<{ emailAddress?: string }>(fetchFn, `${GMAIL}/profile`, { headers: bearer(accessToken) }, "gmail profile");
    if (!profile.emailAddress) throw new ProviderError("failed", 200, "gmail profile: no address");
    return profile.emailAddress.toLowerCase();
  },
  async send(accessToken, email, fetchFn = fetch) {
    const raw = Buffer.from(buildMime(email), "utf8").toString("base64url");
    const sent = await call<{ id?: string; threadId?: string }>(
      fetchFn,
      `${GMAIL}/messages/send`,
      { method: "POST", headers: bearer(accessToken, { "Content-Type": "application/json" }), body: JSON.stringify({ raw }) },
      "gmail send",
    );
    if (!sent.id) throw new ProviderError("failed", 200, "gmail send: no id");
    return { providerMessageId: sent.id, threadId: sent.threadId ?? null };
  },
  async listMessages(accessToken, input, fetchFn = fetch) {
    const after = Math.floor(input.since.getTime() / 1000);
    const ids = new Set<string>();
    // Ask Gmail only for mail to or from known contacts, a few addresses per query.
    for (let i = 0; i < input.contactEmails.length && ids.size < input.limit; i += 12) {
      const group = input.contactEmails.slice(i, i + 12).map((a) => a.replace(/[{}()"\s]/g, ""));
      const q = `after:${after} -in:drafts {${group.map((a) => `from:${a} to:${a} cc:${a}`).join(" ")}}`;
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({ q, maxResults: "100" });
        if (pageToken) params.set("pageToken", pageToken);
        const page = await call<{ messages?: { id: string }[]; nextPageToken?: string }>(
          fetchFn,
          `${GMAIL}/messages?${params}`,
          { headers: bearer(accessToken) },
          "gmail list",
        );
        for (const m of page.messages ?? []) if (ids.size < input.limit) ids.add(m.id);
        pageToken = ids.size < input.limit ? page.nextPageToken : undefined;
      } while (pageToken);
    }
    const metadata = new URLSearchParams({ format: "metadata" });
    for (const h of ["Subject", "From", "To", "Cc"]) metadata.append("metadataHeaders", h);
    const messages = await mapLimit([...ids], 5, (id) =>
      call<GmailMessage>(fetchFn, `${GMAIL}/messages/${encodeURIComponent(id)}?${metadata}`, { headers: bearer(accessToken) }, "gmail get"),
    );
    return messages
      .filter((m) => !(m.labelIds ?? []).includes("DRAFT"))
      .map((m) => {
        const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
        const from = parseAddresses(header("From"))[0] ?? null;
        const sent = (m.labelIds ?? []).includes("SENT") || from === input.accountEmail;
        return {
          providerMessageId: m.id,
          threadId: m.threadId ?? null,
          direction: sent ? ("sent" as const) : ("received" as const),
          from,
          to: parseAddresses(header("To")),
          cc: parseAddresses(header("Cc")),
          subject: header("Subject")?.slice(0, 300) ?? null,
          snippet: cleanSnippet(m.snippet),
          sentAt: new Date(Number(m.internalDate ?? Date.now())),
        };
      });
  },
  async revoke(refreshToken, fetchFn = fetch) {
    try {
      await fetchFn("https://oauth2.googleapis.com/revoke", form({ token: refreshToken }));
    } catch {
      // Best effort.
    }
  },
};

// ---------- Microsoft 365 (Microsoft Graph) ----------

const GRAPH = "https://graph.microsoft.com/v1.0/me";
const msLogin = (tenant: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;

type GraphAddress = { emailAddress?: { address?: string } };
type GraphMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  from?: GraphAddress;
  toRecipients?: GraphAddress[];
  ccRecipients?: GraphAddress[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isDraft?: boolean;
};
const graphAddress = (a: GraphAddress | undefined) => a?.emailAddress?.address?.toLowerCase() ?? null;
const graphAddresses = (list: GraphAddress[] | undefined) => (list ?? []).map(graphAddress).filter((a): a is string => !!a);

const microsoft: ProviderApi = {
  authUrl({ state, codeChallenge }) {
    const client = oauthClient("microsoft");
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES.microsoft.join(" "),
      prompt: "select_account",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${msLogin(client.tenant)}/authorize?${params}`;
  },
  async exchangeCode(code, codeVerifier, fetchFn = fetch) {
    const client = oauthClient("microsoft");
    const body = await call<TokenResponse>(
      fetchFn,
      `${msLogin(client.tenant)}/token`,
      form({
        code,
        code_verifier: codeVerifier,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: client.redirectUri,
        grant_type: "authorization_code",
        scope: SCOPES.microsoft.join(" "),
      }),
      "microsoft token",
    );
    return tokenSet(body, SCOPES.microsoft);
  },
  async refresh(refreshToken, fetchFn = fetch) {
    const client = oauthClient("microsoft");
    const body = await call<TokenResponse>(
      fetchFn,
      `${msLogin(client.tenant)}/token`,
      form({
        refresh_token: refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        grant_type: "refresh_token",
        scope: SCOPES.microsoft.join(" "),
      }),
      "microsoft refresh",
    );
    return tokenSet(body, SCOPES.microsoft);
  },
  async accountEmail(accessToken, fetchFn = fetch) {
    const me = await call<{ mail?: string | null; userPrincipalName?: string }>(
      fetchFn,
      `${GRAPH}?$select=mail,userPrincipalName`,
      { headers: bearer(accessToken) },
      "graph me",
    );
    const address = me.mail || me.userPrincipalName;
    if (!address) throw new ProviderError("failed", 200, "graph me: no address");
    return address.toLowerCase();
  },
  async send(accessToken, email, fetchFn = fetch) {
    const to = email.to.map((address) => ({ emailAddress: { address } }));
    // Create, then send, so the app knows the message's id.
    const draft = await call<GraphMessage>(
      fetchFn,
      `${GRAPH}/messages`,
      {
        method: "POST",
        headers: bearer(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ subject: email.subject, body: { contentType: "Text", content: email.body }, toRecipients: to }),
      },
      "graph draft",
    );
    await call(fetchFn, `${GRAPH}/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST", headers: bearer(accessToken) }, "graph send");
    return { providerMessageId: draft.internetMessageId || `graph:${draft.id}`, threadId: draft.conversationId ?? null };
  },
  async listMessages(accessToken, input, fetchFn = fetch) {
    const known = new Set(input.contactEmails);
    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${input.since.toISOString()}`,
      $orderby: "receivedDateTime desc",
      $top: "100",
      $select: "id,internetMessageId,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isDraft",
    });
    let url: string | undefined = `${GRAPH}/messages?${params}`;
    const out: SyncedMessage[] = [];
    // Graph can't filter by many addresses at once: read recent mail and keep known contacts only.
    let scanned = 0;
    const scanLimit = Math.max(input.limit * 10, 500);
    while (url && scanned < scanLimit && out.length < input.limit) {
      const page: { value?: GraphMessage[]; "@odata.nextLink"?: string } = await call(
        fetchFn,
        url,
        { headers: bearer(accessToken, { Prefer: 'outlook.body-content-type="text"' }) },
        "graph list",
      );
      for (const m of page.value ?? []) {
        scanned++;
        if (m.isDraft) continue;
        const from = graphAddress(m.from);
        const to = graphAddresses(m.toRecipients);
        const cc = graphAddresses(m.ccRecipients);
        if (![from, ...to, ...cc].some((a) => a && known.has(a))) continue;
        out.push({
          providerMessageId: m.internetMessageId || `graph:${m.id}`,
          threadId: m.conversationId ?? null,
          direction: from === input.accountEmail ? "sent" : "received",
          from,
          to,
          cc,
          subject: m.subject?.slice(0, 300) ?? null,
          snippet: cleanSnippet(m.bodyPreview),
          sentAt: new Date(m.sentDateTime ?? m.receivedDateTime ?? Date.now()),
        });
        if (out.length >= input.limit) break;
      }
      url = page["@odata.nextLink"];
    }
    return out;
  },
  async revoke() {
    // Microsoft has no simple token revocation endpoint; the admin removes the app in their account.
  },
};

export const PROVIDERS: Record<EmailProvider, ProviderApi> = { google, microsoft };

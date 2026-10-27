/**
 * Connected email accounts. The app keeps an encrypted refresh token per
 * account (never a password) and trades it for a short-lived access token
 * each time it sends or syncs. Admin-only: nothing here is ever shown to staff.
 */
import { newId, query, type Queryable } from "../db.server";
import { isEmailProvider, type EmailProvider } from "./config.server";
import { TOKEN_KEY_VERSION, decryptToken, encryptToken } from "./crypto.server";
import { PROVIDERS, ProviderError, type FetchLike } from "./providers.server";

export const ACCOUNT_STATUSES = ["active", "needs_reconnect", "disconnected"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** What pages may see about an account (no token). */
export type EmailAccountView = {
  id: string;
  provider: EmailProvider;
  email_address: string;
  status: AccountStatus;
  last_synced_at: string | null;
  /** A short code: auth | busy | failed. */
  last_error: string | null;
  connected_by_name: string | null;
  created_at: string;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export async function listAccounts(db: Queryable = { query }): Promise<EmailAccountView[]> {
  const rows = await db.query<EmailAccountView & { last_synced_at: unknown; created_at: unknown }>(
    `SELECT a.id, a.provider, a.email_address, a.status, a.last_synced_at, a.last_error, u.name AS connected_by_name, a.created_at
       FROM email_accounts a LEFT JOIN users u ON u.id = a.connected_by
      WHERE a.status <> 'disconnected'
      ORDER BY a.created_at DESC`,
  );
  return rows.map((r) => ({ ...r, last_synced_at: iso(r.last_synced_at), created_at: iso(r.created_at) ?? "" }));
}

export async function activeAccounts(db: Queryable = { query }): Promise<EmailAccountView[]> {
  return (await listAccounts(db)).filter((a) => a.status === "active");
}

/** Saves (or refreshes) a connected account after OAuth. One row per provider and address. */
export async function saveConnectedAccount(
  input: { provider: EmailProvider; emailAddress: string; refreshToken: string; scopes: string[]; connectedBy: string },
  db: Queryable = { query },
): Promise<string> {
  const enc = encryptToken(input.refreshToken);
  const existing = await db.query<{ id: string }>(
    "SELECT id FROM email_accounts WHERE provider = $1 AND lower(email_address) = lower($2) ORDER BY created_at LIMIT 1",
    [input.provider, input.emailAddress],
  );
  if (existing[0]) {
    await db.query(
      `UPDATE email_accounts SET refresh_token_enc = $2, key_version = $3, scopes = $4, connected_by = $5,
              status = 'active', last_error = NULL, updated_at = now() WHERE id = $1`,
      [existing[0].id, enc, TOKEN_KEY_VERSION, input.scopes, input.connectedBy],
    );
    return existing[0].id;
  }
  const id = newId();
  await db.query(
    `INSERT INTO email_accounts (id, provider, email_address, connected_by, scopes, refresh_token_enc, key_version, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active')`,
    [id, input.provider, input.emailAddress.toLowerCase(), input.connectedBy, input.scopes, enc, TOKEN_KEY_VERSION],
  );
  return id;
}

type AccountRow = { id: string; provider: string; email_address: string; refresh_token_enc: string; status: string };

async function accountRow(id: string): Promise<AccountRow | null> {
  const rows = await query<AccountRow>(
    "SELECT id, provider, email_address, refresh_token_enc, status FROM email_accounts WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function markAccountError(id: string, error: unknown): Promise<void> {
  const kind = error instanceof ProviderError ? error.kind : "failed";
  await query(
    `UPDATE email_accounts SET last_error = $2, status = CASE WHEN $2 = 'auth' THEN 'needs_reconnect' ELSE status END,
            updated_at = now() WHERE id = $1`,
    [id, kind],
  );
}

/** A fresh access token for an active account. Rotated refresh tokens are saved (encrypted). */
export async function accessTokenFor(
  accountId: string,
  fetchFn: FetchLike = fetch,
): Promise<{ accessToken: string; provider: EmailProvider; emailAddress: string }> {
  const row = await accountRow(accountId);
  if (!row || row.status !== "active" || !isEmailProvider(row.provider) || !row.refresh_token_enc) {
    throw new ProviderError("auth", 0, "account is not active");
  }
  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.refresh_token_enc);
  } catch {
    // The key changed or the value was altered: the admin has to reconnect.
    await markAccountError(accountId, new ProviderError("auth", 0, "token unreadable"));
    throw new ProviderError("auth", 0, "token unreadable");
  }
  try {
    const tokens = await PROVIDERS[row.provider].refresh(refreshToken, fetchFn);
    if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
      await query("UPDATE email_accounts SET refresh_token_enc = $2, key_version = $3, updated_at = now() WHERE id = $1", [
        accountId,
        encryptToken(tokens.refreshToken),
        TOKEN_KEY_VERSION,
      ]);
    }
    return { accessToken: tokens.accessToken, provider: row.provider, emailAddress: row.email_address };
  } catch (error) {
    await markAccountError(accountId, error);
    throw error;
  }
}

/** Stops using an account and forgets its token. Synced messages stay until they age out. */
export async function disconnectAccount(accountId: string, fetchFn: FetchLike = fetch): Promise<void> {
  const row = await accountRow(accountId);
  if (!row) return;
  if (isEmailProvider(row.provider) && row.refresh_token_enc) {
    try {
      await PROVIDERS[row.provider].revoke(decryptToken(row.refresh_token_enc), fetchFn);
    } catch {
      // Best effort: the token is wiped below either way.
    }
  }
  await query(
    "UPDATE email_accounts SET status = 'disconnected', refresh_token_enc = '', sync_cursor = NULL, updated_at = now() WHERE id = $1",
    [accountId],
  );
}

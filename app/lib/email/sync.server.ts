/**
 * Email sync: reads recent mail to and from known contacts and keeps only the
 * subject and a short snippet (no bodies), for 12 months. Each new message is
 * linked to the contacts whose addresses are on it and adds an email_sent or
 * email_received entry (origin 'email', admin-only) to their history.
 */
import { isDemoLoginEnabled } from "../auth.server";
import { schoolToday } from "../dates";
import { newId, query, transaction, type Queryable } from "../db.server";
import { recordHistory } from "../history.server";
import { accessTokenFor, activeAccounts } from "./accounts.server";
import { PROVIDERS, ProviderError, type FetchLike, type SyncedMessage } from "./providers.server";

export const RETENTION_MONTHS = 12;
/** Most messages read per account per run. */
export const SYNC_LIMIT = 300;

export type SyncResult = { ok: true; added: number } | { ok: false; error: "auth" | "busy" | "failed" | "demo" };

/** Lowercased email address to person ids, for every contact with an email (hidden ones too: admin-only data). */
export async function contactEmailMap(db: Queryable = { query }): Promise<Map<string, string[]>> {
  const rows = await db.query<{ id: string; email: string }>(
    "SELECT id, lower(trim(email)) AS email FROM people WHERE email IS NOT NULL AND trim(email) <> ''",
  );
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.email, [...(map.get(r.email) ?? []), r.id]);
  return map;
}

/** The contacts on a message: anyone on From, To or Cc except the mailbox itself. */
export function matchContacts(message: Pick<SyncedMessage, "from" | "to" | "cc">, contacts: Map<string, string[]>, accountEmail: string): string[] {
  const own = accountEmail.toLowerCase();
  const addresses = [message.from, ...message.to, ...message.cc].filter((a): a is string => !!a && a !== own);
  return [...new Set(addresses.flatMap((a) => contacts.get(a.toLowerCase()) ?? []))];
}

export function retentionCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  return cutoff;
}

/**
 * Stores one message (once per account) and its history entries. Returns the
 * new message id, or null when it was already stored or matches no contact.
 */
export async function storeMessage(
  input: {
    accountId: string;
    accountEmail: string;
    provider: string;
    message: SyncedMessage;
    personIds: string[];
    sentViaApp?: boolean;
    sentBy?: string | null;
    meta?: Record<string, unknown>;
  },
  db: Queryable,
): Promise<string | null> {
  const { message } = input;
  if (!input.personIds.length) return null;
  const id = newId();
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO email_messages (id, account_id, provider_message_id, thread_id, direction, from_address, to_addresses,
                                 cc_addresses, subject, snippet, sent_at, sent_via_app, sent_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (account_id, provider_message_id) DO NOTHING
     RETURNING id`,
    [
      id,
      input.accountId,
      message.providerMessageId,
      message.threadId,
      message.direction,
      message.from,
      message.to,
      message.cc,
      message.subject,
      message.snippet,
      message.sentAt,
      input.sentViaApp ?? false,
      input.sentBy ?? null,
    ],
  );
  if (!inserted[0]) return null;
  const happenedOn = schoolToday(message.sentAt);
  for (const personId of input.personIds) {
    await db.query("INSERT INTO email_message_people (message_id, person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, personId]);
    await recordHistory(
      {
        personId,
        kind: message.direction === "sent" ? "email_sent" : "email_received",
        origin: "email",
        visibility: "admin",
        happenedOn,
        notes: message.subject,
        userId: input.sentBy ?? null,
        emailMessageId: id,
        meta: { provider: input.provider, mailbox: input.accountEmail, viaApp: input.sentViaApp ?? false, ...input.meta },
      },
      db,
    );
  }
  return id;
}

/** Drops synced mail older than 12 months (and its synced history entries). Mail sent from the app stays. */
export async function pruneOldMessages(now: Date = new Date(), db: Queryable = { query }): Promise<number> {
  const cutoff = retentionCutoff(now);
  await db.query(
    `DELETE FROM engagements WHERE origin = 'email' AND email_message_id IN (
       SELECT id FROM email_messages WHERE sent_via_app = FALSE AND sent_at < $1)`,
    [cutoff],
  );
  const removed = await db.query<{ id: string }>("DELETE FROM email_messages WHERE sent_via_app = FALSE AND sent_at < $1 RETURNING id", [cutoff]);
  return removed.length;
}

export async function syncAccount(
  accountId: string,
  options: { now?: Date; fetchFn?: FetchLike; limit?: number } = {},
): Promise<SyncResult> {
  // Owner decision: email features refuse in demo mode.
  if (isDemoLoginEnabled()) return { ok: false, error: "demo" };
  const now = options.now ?? new Date();
  const fetchFn = options.fetchFn ?? fetch;
  try {
    const { accessToken, provider, emailAddress } = await accessTokenFor(accountId, fetchFn);
    const last = await query<{ last_synced_at: Date | string | null }>("SELECT last_synced_at FROM email_accounts WHERE id = $1", [accountId]);
    const cutoff = retentionCutoff(now);
    const lastSynced = last[0]?.last_synced_at ? new Date(last[0].last_synced_at) : null;
    // Overlap a day so nothing slips between runs; duplicates are ignored on insert.
    const since = lastSynced && lastSynced.getTime() - 86_400_000 > cutoff.getTime() ? new Date(lastSynced.getTime() - 86_400_000) : cutoff;

    const contacts = await contactEmailMap();
    contacts.delete(emailAddress);
    let added = 0;
    if (contacts.size) {
      const messages = await PROVIDERS[provider].listMessages(
        accessToken,
        { since, contactEmails: [...contacts.keys()], accountEmail: emailAddress, limit: options.limit ?? SYNC_LIMIT },
        fetchFn,
      );
      for (const message of messages) {
        if (message.sentAt < cutoff) continue;
        const personIds = matchContacts(message, contacts, emailAddress);
        const stored = await transaction((tx) =>
          storeMessage({ accountId, accountEmail: emailAddress, provider, message, personIds }, tx),
        );
        if (stored) added++;
      }
    }
    await pruneOldMessages(now);
    await query("UPDATE email_accounts SET last_synced_at = $2, last_error = NULL, updated_at = now() WHERE id = $1", [accountId, now]);
    return { ok: true, added };
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.kind };
    console.error("Email sync failed", error instanceof Error ? error.name : "error");
    await query("UPDATE email_accounts SET last_error = 'failed', updated_at = now() WHERE id = $1", [accountId]);
    return { ok: false, error: "failed" };
  }
}

export async function syncAllAccounts(options: { fetchFn?: FetchLike } = {}): Promise<{ added: number; failed: number }> {
  let added = 0;
  let failed = 0;
  for (const account of await activeAccounts()) {
    const result = await syncAccount(account.id, options);
    if (result.ok) added += result.added;
    else failed++;
  }
  return { added, failed };
}

const globalSync = globalThis as unknown as { __nvaEmailSync?: Promise<unknown> };

/** Starts a background sync when the last one is older than `maxAgeMinutes` (one at a time). Never throws. */
export async function syncIfStale(maxAgeMinutes = 30): Promise<void> {
  if (globalSync.__nvaEmailSync || isDemoLoginEnabled()) return;
  const accounts = await activeAccounts();
  const stale = accounts.filter(
    (a) => !a.last_synced_at || Date.now() - new Date(a.last_synced_at).getTime() > maxAgeMinutes * 60_000,
  );
  if (!stale.length) return;
  globalSync.__nvaEmailSync = (async () => {
    for (const account of stale) await syncAccount(account.id);
  })()
    .catch(() => undefined)
    .finally(() => {
      globalSync.__nvaEmailSync = undefined;
    });
}

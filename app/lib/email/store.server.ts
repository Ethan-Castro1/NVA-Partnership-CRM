/**
 * Reading and writing email data for admin pages: drafts, a contact's email
 * history (verified, from a connected mailbox) and recent mail. Admin-only:
 * every route that calls these checks requireAdmin first.
 */
import { toIsoDate } from "../dates";
import { newId, query, type Queryable } from "../db.server";

import { isDraftPurpose, type DraftPurposeOrCustom } from "./purposes";

export { DRAFT_PURPOSES, isDraftPurpose, type DraftPurpose, type DraftPurposeOrCustom } from "./purposes";

export const MAX_SUBJECT = 300;
export const MAX_BODY = 20_000;

/** A stored fact the AI was given, shown back to the admin as "what this draft used". */
export type DraftFact = { id: string; kind: string; text: string };

export type DraftView = {
  id: string;
  person_id: string;
  author_name: string | null;
  purpose: DraftPurposeOrCustom;
  subject: string;
  body: string;
  ai_generated: boolean;
  facts_used: DraftFact[];
  flags: string[];
  status: "draft" | "sent" | "discarded";
  email_message_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailMessageView = {
  id: string;
  direction: "sent" | "received";
  from_address: string | null;
  to_addresses: string[];
  subject: string | null;
  snippet: string | null;
  sent_at: string | null;
  sent_via_app: boolean;
  sent_by_name: string | null;
  mailbox: string;
  provider: string;
};

export type RecentEmailView = EmailMessageView & { people: { id: string; full_name: string }[] };

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const json = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
};

type DraftRow = Omit<DraftView, "created_at" | "updated_at" | "facts_used" | "flags" | "subject" | "body" | "purpose"> & {
  subject: string | null;
  body: string | null;
  purpose: string | null;
  facts_used: unknown;
  flags: unknown;
  created_at: unknown;
  updated_at: unknown;
};

function toDraft(row: DraftRow): DraftView {
  return {
    ...row,
    purpose: isDraftPurpose(row.purpose) ? row.purpose : "custom",
    subject: row.subject ?? "",
    body: row.body ?? "",
    facts_used: json<DraftFact[]>(row.facts_used, []),
    flags: json<string[]>(row.flags, []),
    created_at: iso(row.created_at) ?? "",
    updated_at: iso(row.updated_at) ?? "",
  };
}

const DRAFT_COLUMNS = `d.id, d.person_id, u.name AS author_name, d.purpose, d.subject, d.body, d.ai_generated, d.facts_used,
  d.flags, d.status, d.email_message_id, d.created_at, d.updated_at`;

export async function createDraft(
  input: {
    personId: string;
    authorId: string;
    purpose: DraftPurposeOrCustom;
    subject: string;
    body: string;
    aiGenerated: boolean;
    factsUsed?: DraftFact[];
    flags?: string[];
  },
  db: Queryable = { query },
): Promise<string> {
  const id = newId();
  await db.query(
    `INSERT INTO email_drafts (id, person_id, author_id, purpose, subject, body, ai_generated, facts_used, flags, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'draft')`,
    [
      id,
      input.personId,
      input.authorId,
      input.purpose,
      input.subject.slice(0, MAX_SUBJECT),
      input.body.slice(0, MAX_BODY),
      input.aiGenerated,
      JSON.stringify(input.factsUsed ?? []),
      JSON.stringify(input.flags ?? []),
    ],
  );
  return id;
}

/** A draft, only when it belongs to this person (so a draft id can't be used on someone else's page). */
export async function getDraft(draftId: string, personId: string, db: Queryable = { query }): Promise<DraftView | null> {
  if (!draftId || draftId.length > 100) return null;
  const rows = await db.query<DraftRow>(
    `SELECT ${DRAFT_COLUMNS} FROM email_drafts d LEFT JOIN users u ON u.id = d.author_id WHERE d.id = $1 AND d.person_id = $2`,
    [draftId, personId],
  );
  return rows[0] ? toDraft(rows[0]) : null;
}

export async function listDrafts(personId: string, db: Queryable = { query }): Promise<DraftView[]> {
  const rows = await db.query<DraftRow>(
    `SELECT ${DRAFT_COLUMNS} FROM email_drafts d LEFT JOIN users u ON u.id = d.author_id
      WHERE d.person_id = $1 AND d.status <> 'discarded' ORDER BY d.updated_at DESC LIMIT 30`,
    [personId],
  );
  return rows.map(toDraft);
}

/** Drafts waiting for review across all contacts (Communications page). */
export async function listOpenDrafts(limit = 20): Promise<(DraftView & { person_name: string })[]> {
  const rows = await query<DraftRow & { person_name: string }>(
    `SELECT ${DRAFT_COLUMNS}, p.full_name AS person_name FROM email_drafts d
       JOIN people p ON p.id = d.person_id LEFT JOIN users u ON u.id = d.author_id
      WHERE d.status = 'draft' ORDER BY d.updated_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ...toDraft(r), person_name: r.person_name }));
}

/** Saves the admin's edits. Only open drafts can change. */
export async function updateDraft(draftId: string, personId: string, edits: { subject: string; body: string }): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE email_drafts SET subject = $3, body = $4, updated_at = now()
      WHERE id = $1 AND person_id = $2 AND status = 'draft' RETURNING id`,
    [draftId, personId, edits.subject.slice(0, MAX_SUBJECT), edits.body.slice(0, MAX_BODY)],
  );
  return rows.length > 0;
}

export async function discardDraft(draftId: string, personId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "UPDATE email_drafts SET status = 'discarded', updated_at = now() WHERE id = $1 AND person_id = $2 AND status = 'draft' RETURNING id",
    [draftId, personId],
  );
  return rows.length > 0;
}

const MESSAGE_COLUMNS = `m.id, m.direction, m.from_address, m.to_addresses, m.subject, m.snippet, m.sent_at, m.sent_via_app,
  su.name AS sent_by_name, a.email_address AS mailbox, a.provider`;

type MessageRow = Omit<EmailMessageView, "sent_at"> & { sent_at: unknown };
const toMessage = (r: MessageRow): EmailMessageView => ({ ...r, sent_at: iso(r.sent_at) });

/** Email with one contact from connected mailboxes (verified activity), newest first. */
export async function listMessagesForPerson(personId: string, limit = 50, db: Queryable = { query }): Promise<EmailMessageView[]> {
  const rows = await db.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS}
       FROM email_message_people mp
       JOIN email_messages m ON m.id = mp.message_id
       JOIN email_accounts a ON a.id = m.account_id
       LEFT JOIN users su ON su.id = m.sent_by
      WHERE mp.person_id = $1
      ORDER BY m.sent_at DESC NULLS LAST
      LIMIT $2`,
    [personId, limit],
  );
  return rows.map(toMessage);
}

/** Recent email with any contact (Communications page). */
export async function listRecentMessages(
  options: { direction?: "sent" | "received"; limit?: number } = {},
): Promise<RecentEmailView[]> {
  const rows = await query<MessageRow & { people: unknown }>(
    `SELECT ${MESSAGE_COLUMNS},
            COALESCE((SELECT json_agg(json_build_object('id', p.id, 'full_name', p.full_name) ORDER BY p.full_name)
                        FROM email_message_people mp JOIN people p ON p.id = mp.person_id
                       WHERE mp.message_id = m.id), '[]') AS people
       FROM email_messages m
       JOIN email_accounts a ON a.id = m.account_id
       LEFT JOIN users su ON su.id = m.sent_by
      WHERE ($1::text IS NULL OR m.direction = $1)
      ORDER BY m.sent_at DESC NULLS LAST
      LIMIT $2`,
    [options.direction ?? null, Math.min(Math.max(options.limit ?? 50, 1), 200)],
  );
  return rows.map((r) => ({ ...toMessage(r), people: json<{ id: string; full_name: string }[]>(r.people, []) }));
}

/** Hand-typed email notes from the history (origin 'manual'), shown apart from verified email. */
export async function listManualEmailNotes(personId: string): Promise<{ id: string; kind: string; happened_on: string; notes: string | null; user_name: string | null }[]> {
  const rows = await query<{ id: string; kind: string; happened_on: unknown; notes: string | null; user_name: string | null }>(
    `SELECT e.id, e.kind, e.happened_on, e.notes, u.name AS user_name
       FROM engagements e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.person_id = $1 AND e.kind IN ('email_sent', 'email_received') AND e.origin = 'manual'
      ORDER BY e.happened_on DESC, e.created_at DESC LIMIT 30`,
    [personId],
  );
  return rows.map((r) => ({
    ...r,
    happened_on: toIsoDate(r.happened_on) ?? "",
  }));
}

export async function emailCounts(): Promise<{ drafts: number; sent30: number; received30: number }> {
  const rows = await query<{ drafts: number; sent30: number; received30: number }>(
    `SELECT (SELECT count(*)::int FROM email_drafts WHERE status = 'draft') AS drafts,
            (SELECT count(*)::int FROM email_messages WHERE direction = 'sent' AND sent_at > now() - interval '30 days') AS sent30,
            (SELECT count(*)::int FROM email_messages WHERE direction = 'received' AND sent_at > now() - interval '30 days') AS received30`,
  );
  return rows[0] ?? { drafts: 0, sent30: 0, received30: 0 };
}

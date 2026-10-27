/**
 * Sending a reviewed draft through the connected mailbox.
 *
 * Nothing is ever sent automatically: sendDraft refuses unless the caller
 * passes `approved: true`, which the compose page sets only when an admin
 * clicks Send and confirms. Sent mail is stored (subject and snippet only),
 * linked to the contact, and recorded as an email_sent history entry.
 */
import { isDemoLoginEnabled } from "../auth.server";
import { transaction } from "../db.server";
import { getPerson } from "../people.server";
import type { SessionUser } from "../types";
import { accessTokenFor, activeAccounts } from "./accounts.server";
import { cleanSnippet, isEmailAddress } from "./mime";
import { PROVIDERS, ProviderError, type FetchLike } from "./providers.server";
import { getDraft } from "./store.server";
import { storeMessage } from "./sync.server";

export type SendError =
  | "notApproved"
  | "demo"
  | "notAdmin"
  | "noAccount"
  | "noRecipient"
  | "notDraft"
  | "empty"
  | "auth"
  | "busy"
  | "failed";

export type SendResult = { ok: true; messageId: string; to: string } | { ok: false; error: SendError };

export async function sendDraft(input: {
  draftId: string;
  personId: string;
  admin: SessionUser;
  /** True only after the admin explicitly clicked Send and confirmed. */
  approved: boolean;
  accountId?: string | null;
  fetchFn?: FetchLike;
}): Promise<SendResult> {
  if (input.approved !== true) return { ok: false, error: "notApproved" };
  if (input.admin.role !== "admin") return { ok: false, error: "notAdmin" };
  if (isDemoLoginEnabled()) return { ok: false, error: "demo" };

  const draft = await getDraft(input.draftId, input.personId);
  if (!draft || draft.status !== "draft") return { ok: false, error: "notDraft" };
  const subject = draft.subject.trim();
  const body = draft.body.trim();
  if (!subject || !body) return { ok: false, error: "empty" };

  const person = await getPerson(input.personId, input.admin);
  const to = person?.email?.trim().toLowerCase() ?? "";
  if (!person || !isEmailAddress(to)) return { ok: false, error: "noRecipient" };

  const accounts = await activeAccounts();
  const account = input.accountId ? accounts.find((a) => a.id === input.accountId) : accounts[0];
  if (!account) return { ok: false, error: "noAccount" };

  const fetchFn = input.fetchFn ?? fetch;
  try {
    const { accessToken, provider, emailAddress } = await accessTokenFor(account.id, fetchFn);
    const sent = await PROVIDERS[provider].send(accessToken, { from: emailAddress, to: [to], subject, body }, fetchFn);
    const messageId = await transaction(async (tx) => {
      const id = await storeMessage(
        {
          accountId: account.id,
          accountEmail: emailAddress,
          provider,
          sentViaApp: true,
          sentBy: input.admin.id,
          personIds: [person.id],
          meta: { draftId: draft.id, aiGenerated: draft.ai_generated, purpose: draft.purpose },
          message: {
            providerMessageId: sent.providerMessageId,
            threadId: sent.threadId,
            direction: "sent",
            from: emailAddress,
            to: [to],
            cc: [],
            subject,
            snippet: cleanSnippet(body),
            sentAt: new Date(),
          },
        },
        tx,
      );
      await tx.query("UPDATE email_drafts SET status = 'sent', email_message_id = $2, updated_at = now() WHERE id = $1", [draft.id, id]);
      return id;
    });
    if (!messageId) return { ok: false, error: "failed" };
    return { ok: true, messageId, to };
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error: error.kind };
    console.error("Email send failed", error instanceof Error ? error.name : "error");
    return { ok: false, error: "failed" };
  }
}

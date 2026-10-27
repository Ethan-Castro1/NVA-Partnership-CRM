/**
 * "Create a follow-up?" after an email is sent. Inserts a follow_ups row
 * (the Follow-ups page and profile panels show and manage it) and notes it in
 * the contact's history. Reminders stay inside the app; they never send email.
 */
import { addDays, isIsoDate, schoolToday } from "../dates";
import { newId, transaction } from "../db.server";
import { recordHistory } from "../history.server";

export const MAX_FOLLOW_UP_ACTION = 300;

/** Due date for the offer: one week from today at the school. */
export const defaultFollowUpDue = (today = schoolToday()) => addDays(today, 7);

export async function createFollowUpAfterSend(input: {
  personId: string;
  action: string;
  dueOn: string;
  awaitingResponse: boolean;
  userId: string;
  emailMessageId?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: "actionRequired" | "dateInvalid" }> {
  const action = input.action.trim().slice(0, MAX_FOLLOW_UP_ACTION);
  if (!action) return { ok: false, error: "actionRequired" };
  if (!isIsoDate(input.dueOn)) return { ok: false, error: "dateInvalid" };
  const id = newId();
  await transaction(async (tx) => {
    await tx.query(
      `INSERT INTO follow_ups (id, person_id, action, due_on, owner_user_id, status, awaiting_response, created_by)
       VALUES ($1,$2,$3,$4::date,$5,'open',$6,$5)`,
      [id, input.personId, action, input.dueOn, input.userId, input.awaitingResponse],
    );
    await recordHistory(
      {
        personId: input.personId,
        kind: "follow_up_scheduled",
        origin: "system",
        visibility: "admin",
        userId: input.userId,
        followUpId: id,
        emailMessageId: input.emailMessageId ?? null,
        notes: action,
      },
      tx,
    );
  });
  return { ok: true, id };
}

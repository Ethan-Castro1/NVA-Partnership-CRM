/**
 * Resource route /app/follow-ups/action: every follow-up change, posted by
 * FollowUpList and QuickFollowUpForm (fetchers). Admins only.
 *
 * intent=create      personId, action, dueOn, opportunityId?, ownerUserId?, awaitingResponse?
 * intent=complete    id, note?, nextAction? + nextDueOn? (adds the next follow-up too)
 * intent=reschedule  id, dueOn
 * intent=awaiting    id, awaiting=true|false
 * intent=cancel      id
 *
 * Returns JSON { ok, id?, error?, errors? } (error keys are i18n keys). With a
 * `redirectTo` field (same-site path) it redirects instead, for plain forms.
 */
import { data, redirect } from "react-router";
import type { Route } from "./+types/app.follow-ups.action";
import { safeNext } from "~/lib/auth.server";
import { isIsoDate } from "~/lib/dates";
import {
  FollowUpInputError,
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  parseFollowUpForm,
  parseNextFollowUp,
  rescheduleFollowUp,
  setAwaitingResponse,
} from "~/lib/follow-ups.server";
import { requireAdminViewer } from "~/lib/permissions.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminViewer(request);
  return data({ ok: false, error: "crm.error.saveFailed" as const }, { status: 405 });
}

const fail = (status = 400) => data({ ok: false as const, error: "crm.error.saveFailed" as const }, { status });

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdminViewer(request);
  const form = await request.formData();
  const field = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const intent = field("intent");
  const id = field("id");
  const redirectTo = field("redirectTo");
  const done = (body: { ok: true; id?: string }) => (redirectTo ? redirect(safeNext(redirectTo)) : data(body));

  try {
    switch (intent) {
      case "create": {
        const parsed = parseFollowUpForm(form);
        if (!parsed.ok) return data({ ok: false as const, errors: parsed.errors }, { status: 400 });
        const newId = await createFollowUp(user, parsed.value);
        return done({ ok: true, id: newId });
      }
      case "complete": {
        if (!id) return fail();
        const next = parseNextFollowUp(form);
        if (!next.ok) return data({ ok: false as const, errors: next.errors }, { status: 400 });
        const result = await completeFollowUp(user, id, { note: field("note") || null, next: next.value ?? undefined });
        return done({ ok: true, id: result.nextId ?? id });
      }
      case "reschedule": {
        const dueOn = field("dueOn");
        if (!id) return fail();
        if (!isIsoDate(dueOn)) return data({ ok: false as const, errors: { dueOn: "crm.error.badDate" as const } }, { status: 400 });
        await rescheduleFollowUp(user, id, dueOn);
        return done({ ok: true, id });
      }
      case "awaiting": {
        if (!id) return fail();
        await setAwaitingResponse(user, id, field("awaiting") === "true");
        return done({ ok: true, id });
      }
      case "cancel": {
        if (!id) return fail();
        await cancelFollowUp(user, id);
        return done({ ok: true, id });
      }
      default:
        return fail();
    }
  } catch (error) {
    if (error instanceof FollowUpInputError) return fail();
    // A follow-up that no longer exists: answer in place instead of an error page.
    if (error instanceof Response && error.status === 404) return fail(404);
    throw error;
  }
}

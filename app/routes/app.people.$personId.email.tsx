/**
 * /app/people/:personId/email: write to one contact (AI draft or by hand),
 * edit, send only after an explicit click and confirmation, then offer a
 * follow-up. Shows verified email with this person apart from hand-typed
 * notes. Admins only (loader and action), so staff never reach drafts or
 * email history.
 */
import { Link, data, redirect, useActionData, useLoaderData } from "react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.people.$personId.email";
import { formatDay } from "~/components/admin/format";
import { ComposeStart, DraftEditor, FollowUpOffer, type SendBlock } from "~/components/email/compose";
import { DraftList, EmailMessageList, ManualEmailNotes } from "~/components/email/message-list";
import { PageHeader, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT, type Locale, type MessageKey } from "~/i18n";
import { generateDraft } from "~/lib/ai/drafts.server";
import { isAiConfigured } from "~/lib/ai/client.server";
import { requireAdmin } from "~/lib/auth.server";
import { isIsoDate } from "~/lib/dates";
import { query } from "~/lib/db.server";
import { activeAccounts, listAccounts } from "~/lib/email/accounts.server";
import { emailSetup } from "~/lib/email/config.server";
import { createFollowUpAfterSend, defaultFollowUpDue } from "~/lib/email/follow-up.server";
import { isEmailAddress } from "~/lib/email/mime";
import { isDraftPurpose } from "~/lib/email/purposes";
import { sendDraft } from "~/lib/email/send.server";
import {
  MAX_BODY,
  MAX_SUBJECT,
  createDraft,
  discardDraft,
  getDraft,
  listDrafts,
  listManualEmailNotes,
  listMessagesForPerson,
  updateDraft,
} from "~/lib/email/store.server";
import { syncIfStale } from "~/lib/email/sync.server";
import { getPerson } from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches, loaderData }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const name = loaderData?.person.full_name;
  return [{ title: `${name ? `${t("email.eyebrow")}: ${name}` : t("email.eyebrow")} | ${t("common.schoolName")}` }];
};

async function loadPerson(request: Request, personId: string) {
  const admin = await requireAdmin(request);
  const person = await getPerson(personId, admin);
  if (!person) throw data(null, { status: 404 });
  return { admin, person };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { admin, person } = await loadPerson(request, params.personId);
  const url = new URL(request.url);
  const setup = emailSetup();
  void syncIfStale().catch(() => undefined);

  const [drafts, messages, notes, accounts, allAccounts] = await Promise.all([
    listDrafts(person.id),
    listMessagesForPerson(person.id),
    listManualEmailNotes(person.id),
    activeAccounts(),
    listAccounts(),
  ]);

  const draftParam = url.searchParams.get("draft");
  const sentParam = url.searchParams.get("sent");
  const current = draftParam ? await getDraft(draftParam, person.id) : null;
  const sent = sentParam ? await getDraft(sentParam, person.id) : null;
  const followUpDue = url.searchParams.get("followup");

  const to = person.email && isEmailAddress(person.email.trim()) ? person.email.trim() : null;
  const sendBlock: SendBlock = setup.demoMode ? "demo" : !accounts.length ? "noMailbox" : !to ? "noAddress" : null;
  const defaultLanguage: Locale =
    person.preferred_language === "es" ? "es" : person.preferred_language === "en" ? "en" : admin.locale === "es" ? "es" : "en";

  return {
    person: { id: person.id, full_name: person.full_name, organization_name: person.organization_name, title: person.title },
    to,
    drafts,
    current: current?.status === "draft" ? current : null,
    sent: sent?.status === "sent" ? { id: sent.id, messageId: sent.email_message_id } : null,
    followUpDue: followUpDue && isIsoDate(followUpDue) ? followUpDue : null,
    messages,
    notes,
    accounts,
    reconnect: allAccounts.filter((a) => a.status === "needs_reconnect").map((a) => a.email_address),
    demoMode: setup.demoMode,
    aiOn: isAiConfigured(),
    defaultLanguage,
    dueDefault: defaultFollowUpDue(),
    sendBlock,
  };
}

const id = z.string().min(1).max(100);
const edits = { draftId: id, subject: z.string().max(MAX_SUBJECT).default(""), body: z.string().max(MAX_BODY).default("") };
const ActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("draft"),
    purpose: z.string().refine(isDraftPurpose),
    language: z.enum(["en", "es"]).catch("en"),
    statedPurpose: z.string().max(800).optional(),
  }),
  z.object({ intent: z.literal("blank") }),
  z.object({ intent: z.literal("save"), ...edits }),
  z.object({ intent: z.literal("discard"), draftId: id }),
  z.object({
    intent: z.literal("send"),
    ...edits,
    // Present only when the admin clicked Send and then "Send now" in the confirmation.
    approve: z.string().optional(),
    accountId: z.string().max(100).optional(),
  }),
  z.object({
    intent: z.literal("followup"),
    action: z.string().max(300),
    dueOn: z.string().max(10),
    awaiting: z.string().optional(),
    messageId: z.string().max(100).optional(),
  }),
]);

type ActionResult = { ok: true; message: MessageKey } | { ok: false; error: MessageKey };
const fail = (error: MessageKey, status = 400) => data<ActionResult>({ ok: false, error }, { status });

export async function action({ request, params }: Route.ActionArgs) {
  const { admin, person } = await loadPerson(request, params.personId);
  const base = `/app/people/${person.id}/email`;
  const parsed = ActionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return fail("email.error.invalid");
  const input = parsed.data;

  switch (input.intent) {
    case "draft": {
      if (!isDraftPurpose(input.purpose)) return fail("email.error.invalid");
      const outcome = await generateDraft({
        personId: person.id,
        admin,
        purpose: input.purpose,
        statedPurpose: input.statedPurpose,
        language: input.language,
      });
      if (!outcome.ok) return fail(outcome.error === "notConfigured" ? "email.error.aiNotConfigured" : "email.error.aiFailed", outcome.error === "notFound" ? 404 : 400);
      const draftId = await createDraft({
        personId: person.id,
        authorId: admin.id,
        purpose: input.purpose,
        subject: outcome.subject,
        body: outcome.body,
        aiGenerated: true,
        factsUsed: outcome.factsUsed,
        flags: outcome.flags,
      });
      return redirect(`${base}?draft=${draftId}`);
    }
    case "blank": {
      const draftId = await createDraft({ personId: person.id, authorId: admin.id, purpose: "custom", subject: "", body: "", aiGenerated: false });
      return redirect(`${base}?draft=${draftId}`);
    }
    case "save": {
      if (!(await updateDraft(input.draftId, person.id, input))) return fail("email.error.notDraft", 409);
      return data<ActionResult>({ ok: true, message: "email.draft.saved" });
    }
    case "discard": {
      await discardDraft(input.draftId, person.id);
      return redirect(base);
    }
    case "send": {
      // Keep the admin's latest edits, then send only with explicit approval.
      if (!(await updateDraft(input.draftId, person.id, input))) return fail("email.error.notDraft", 409);
      const result = await sendDraft({
        draftId: input.draftId,
        personId: person.id,
        admin,
        approved: input.approve === "yes",
        accountId: input.accountId || null,
      });
      if (!result.ok) return fail(`email.error.${result.error}`, result.error === "notApproved" ? 400 : result.error === "demo" ? 403 : 400);
      return redirect(`${base}?sent=${input.draftId}`);
    }
    case "followup": {
      let messageId: string | null = null;
      if (input.messageId) {
        const linked = await query("SELECT 1 FROM email_message_people WHERE message_id = $1 AND person_id = $2", [input.messageId, person.id]);
        messageId = linked.length ? input.messageId : null;
      }
      const result = await createFollowUpAfterSend({
        personId: person.id,
        action: input.action,
        dueOn: input.dueOn,
        awaitingResponse: input.awaiting === "yes",
        userId: admin.id,
        emailMessageId: messageId,
      });
      if (!result.ok) return fail(`email.error.${result.error}`);
      return redirect(`${base}?followup=${input.dueOn}`);
    }
  }
}

export default function PersonEmail() {
  const d = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const { t, locale } = useT();
  const base = `/app/people/${d.person.id}/email`;
  const subtitle = [d.person.title, d.person.organization_name].filter(Boolean).join(", ");

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to={`/app/people/${d.person.id}`}>
          <ArrowLeft aria-hidden="true" />
          {t("email.backToProfile")}
        </Link>
      </Button>
      <PageHeader
        title={d.person.full_name}
        description={[subtitle, d.to].filter(Boolean).join(" · ") || undefined}
      />

      <div className="grid gap-2">
        {d.demoMode && <p className="rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">{t("email.demoOff")}</p>}
        {!d.to && <p className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">{t("email.noAddress", { name: d.person.full_name })}</p>}
        {!d.demoMode && d.accounts.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">
            <span>{t("email.noMailbox")}</span>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/admin/settings/email">{t("email.connectMailbox")}</Link>
            </Button>
          </div>
        )}
        {d.reconnect.map((m) => (
          <p key={m} className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
            {t("email.mailboxNeedsReconnect", { mailbox: m })}
          </p>
        ))}
        {result && (
          <p
            role={result.ok ? "status" : "alert"}
            className={result.ok ? "rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink" : "rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink"}
          >
            {result.ok ? t(result.message) : t(result.error)}
          </p>
        )}
        {d.followUpDue && (
          <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
            {t("email.followUp.created", { date: formatDay(d.followUpDue, locale) })}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          {d.sent ? (
            <Panel>
              <div className="grid gap-4">
                <p role="status" className="flex items-center gap-2 font-medium text-sage-ink">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                  {t("email.send.done", { to: d.to ?? "" })}
                </p>
                <FollowUpOffer personName={d.person.full_name} dueDefault={d.dueDefault} messageId={d.sent.messageId} skipHref={base} />
              </div>
            </Panel>
          ) : d.current ? (
            <Panel
              title={t("email.draft.title")}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to={base}>{t("email.draft.new")}</Link>
                </Button>
              }
            >
              <DraftEditor key={d.current.id + d.current.updated_at} draft={d.current} to={d.to} accounts={d.accounts} sendBlock={d.sendBlock} />
            </Panel>
          ) : (
            <Panel title={t("email.compose.title")}>
              <ComposeStart aiOn={d.aiOn} defaultLanguage={d.defaultLanguage} />
            </Panel>
          )}

          {d.drafts.length > 0 && (
            <Panel title={t("email.draft.listTitle")}>
              <DraftList drafts={d.drafts} currentId={d.current?.id} hrefFor={(x) => (x.status === "draft" ? `${base}?draft=${x.id}` : base)} />
            </Panel>
          )}
        </div>

        <div className="grid content-start gap-6">
          <Panel title={t("email.history.title")}>
            <EmailMessageList messages={d.messages} />
          </Panel>
          {d.notes.length > 0 && (
            <Panel title={t("email.notes.title")}>
              <ManualEmailNotes notes={d.notes} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

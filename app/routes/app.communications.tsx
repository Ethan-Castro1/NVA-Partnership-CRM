/**
 * /app/communications: email with contacts (from the connected mailbox and
 * sent from the app) and drafts waiting for review. Admins only.
 */
import { Link, data, useActionData, useLoaderData, useSearchParams } from "react-router";
import { FilePen, Inbox, Send } from "lucide-react";
import type { Route } from "./+types/app.communications";
import { SyncButton } from "~/components/email/mailboxes";
import { DraftList, EmailMessageList } from "~/components/email/message-list";
import { PageHeader, Panel, StatTile } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { activeAccounts } from "~/lib/email/accounts.server";
import { emailSetup } from "~/lib/email/config.server";
import { emailCounts, listOpenDrafts, listRecentMessages } from "~/lib/email/store.server";
import { syncAllAccounts, syncIfStale } from "~/lib/email/sync.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("email.comms.title")} | ${t("common.schoolName")}` }];
};

const SHOWS = ["all", "sent", "received"] as const;
type Show = (typeof SHOWS)[number];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const raw = new URL(request.url).searchParams.get("show");
  const show: Show = (SHOWS as readonly string[]).includes(raw ?? "") ? (raw as Show) : "all";
  // Keep history fresh without waiting for it (refuses in demo mode).
  void syncIfStale().catch(() => undefined);
  const [accounts, drafts, messages, counts] = await Promise.all([
    activeAccounts(),
    listOpenDrafts(20),
    listRecentMessages({ direction: show === "all" ? undefined : show, limit: 60 }),
    emailCounts(),
  ]);
  return { mailboxes: accounts.map((a) => a.email_address), drafts, messages, counts, show, demoMode: emailSetup().demoMode };
}

type ActionResult = { ok: true; count: number } | { ok: false; error: MessageKey };

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  if (form.get("intent") !== "sync") return data<ActionResult>({ ok: false, error: "email.error.invalid" }, { status: 400 });
  if (emailSetup().demoMode) return data<ActionResult>({ ok: false, error: "email.error.demo" }, { status: 403 });
  const result = await syncAllAccounts();
  if (result.failed) return data<ActionResult>({ ok: false, error: "email.error.failed" });
  return data<ActionResult>({ ok: true, count: result.added });
}

export default function Communications() {
  const { mailboxes, drafts, messages, counts, show, demoMode } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const [params] = useSearchParams();
  const { t } = useT();

  const showHref = (s: Show) => {
    const next = new URLSearchParams(params);
    if (s === "all") next.delete("show");
    else next.set("show", s);
    const q = next.toString();
    return q ? `?${q}` : ".";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("common.nav.adminSection")}
        title={t("email.comms.title")}
        description={t("email.comms.description")}
        actions={mailboxes.length > 0 ? <SyncButton disabled={demoMode} /> : undefined}
      />

      {demoMode && <p className="rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">{t("email.demoOff")}</p>}
      {!demoMode && mailboxes.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">
          <span>{t("email.comms.noMailbox")}</span>
          <Button asChild variant="outline" size="sm">
            <Link to="/app/admin/settings/email">{t("email.connectMailbox")}</Link>
          </Button>
        </div>
      )}
      {result && (
        <p role={result.ok ? "status" : "alert"} className={cn("rounded-xl px-3.5 py-2.5 text-sm", result.ok ? "bg-sage-soft text-sage-ink" : "bg-rust-soft text-rust-ink")}>
          {result.ok ? t("email.sync.done", { count: result.count }) : t(result.error)}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label={t("email.comms.drafts")} value={counts.drafts} icon={<FilePen />} />
        <StatTile label={t("email.comms.sent30")} value={counts.sent30} icon={<Send />} accent="classroom_volunteer" />
        <StatTile label={t("email.comms.received30")} value={counts.received30} icon={<Inbox />} accent="internship" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel
          title={t("email.comms.recentTitle")}
          action={
            <nav className="flex gap-1" aria-label={t("email.comms.recentTitle")}>
              {SHOWS.map((s) => (
                <Link
                  key={s}
                  to={showHref(s)}
                  aria-current={s === show ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    s === show ? "bg-ink text-canvas" : "bg-canvas text-graphite hover:bg-stone",
                  )}
                >
                  {t(`email.comms.show.${s}`)}
                </Link>
              ))}
            </nav>
          }
        >
          <EmailMessageList messages={messages} showPeople empty={t("email.comms.recentNone")} />
        </Panel>
        <Panel title={t("email.comms.draftsTitle")}>
          <div className="grid gap-3">
            <DraftList drafts={drafts} showPerson hrefFor={(d) => `/app/people/${d.person_id}/email?draft=${d.id}`} />
            <p className="text-xs text-smoke">{t("email.comms.compose")}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/**
 * /app/admin/settings/email: connect NVA's mailbox (Google Workspace first,
 * Microsoft 365 also), see what's still needed on the server, sync and
 * disconnect. Admins only.
 */
import { data, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/app.admin.settings.email";
import { MailboxList } from "~/components/email/mailboxes";
import { EmailSetupChecklist } from "~/components/email/setup";
import { PageHeader, Panel } from "~/components/nva";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { disconnectAccount, listAccounts } from "~/lib/email/accounts.server";
import { emailSetup, isEmailProvider } from "~/lib/email/config.server";
import { SCOPES } from "~/lib/email/providers.server";
import { syncAllAccounts } from "~/lib/email/sync.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("settings.email.title")} | ${t("common.schoolName")}` }];
};

const FLASH_ERRORS = ["denied", "state", "noRefresh", "notConfigured", "demo", "failed"] as const;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const connected = url.searchParams.get("connected");
  const error = url.searchParams.get("error");
  return {
    setup: emailSetup(),
    accounts: await listAccounts(),
    scopes: SCOPES,
    connected: isEmailProvider(connected) ? connected : null,
    error: (FLASH_ERRORS as readonly string[]).includes(error ?? "") ? (error as (typeof FLASH_ERRORS)[number]) : null,
  };
}

const ActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("sync") }),
  z.object({ intent: z.literal("disconnect"), accountId: z.string().min(1).max(100) }),
]);

type ActionResult = { ok: true; message: MessageKey; count?: number } | { ok: false; error: MessageKey };

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const parsed = ActionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data<ActionResult>({ ok: false, error: "email.error.invalid" }, { status: 400 });
  if (emailSetup().demoMode) return data<ActionResult>({ ok: false, error: "email.error.demo" }, { status: 403 });
  if (parsed.data.intent === "sync") {
    const result = await syncAllAccounts();
    if (result.failed) return data<ActionResult>({ ok: false, error: "email.error.failed" });
    return data<ActionResult>({ ok: true, message: "email.sync.done", count: result.added });
  }
  await disconnectAccount(parsed.data.accountId);
  return data<ActionResult>({ ok: true, message: "settings.accounts.disconnected" });
}

export default function EmailSettings() {
  const { setup, accounts, scopes, connected, error } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const { t } = useT();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("settings.title")} title={t("settings.email.title")} description={t("settings.email.description")} />

      {setup.demoMode && <p className="rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">{t("settings.demoMode")}</p>}
      {connected && (
        <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
          {t("settings.flash.connected", { provider: t(`settings.provider.${connected}`) })}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
          {t(`settings.flash.error.${error}`)}
        </p>
      )}
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink" : "rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink"}
        >
          {result.ok ? t(result.message, { count: result.count ?? 0 }) : t(result.error)}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid content-start gap-6">
          <Panel title={t("settings.accounts.title")}>
            <MailboxList accounts={accounts} providers={setup.providers} demoMode={setup.demoMode} />
          </Panel>
          <Panel title={t("settings.email.keeps")}>
            <p className="text-sm text-graphite">{t("settings.email.keepsBody")}</p>
          </Panel>
        </div>
        <Panel title={t("settings.checklist.title")}>
          <EmailSetupChecklist setup={setup} scopes={scopes} />
        </Panel>
      </div>
    </div>
  );
}

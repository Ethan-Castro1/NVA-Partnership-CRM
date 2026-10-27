/** /app/admin/settings: email connection, AI and staff accounts at a glance. Admins only. */
import { Link, useLoaderData } from "react-router";
import { ArrowRight } from "lucide-react";
import type { Route } from "./+types/app.admin.settings._index";
import { EmailSetupChecklist } from "~/components/email/setup";
import { PageHeader, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { aiModel, isAiConfigured } from "~/lib/ai/client.server";
import { requireAdmin } from "~/lib/auth.server";
import { activeAccounts } from "~/lib/email/accounts.server";
import { emailSetup } from "~/lib/email/config.server";
import { SCOPES } from "~/lib/email/providers.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("settings.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const ai = isAiConfigured();
  return {
    setup: emailSetup(),
    mailboxes: (await activeAccounts()).map((a) => a.email_address),
    scopes: SCOPES,
    ai: { on: ai, model: ai ? aiModel() : null },
  };
}

export default function Settings() {
  const { setup, mailboxes, scopes, ai } = useLoaderData<typeof loader>();
  const { t } = useT();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("common.nav.adminSection")} title={t("settings.title")} description={t("settings.description")} />
      {setup.demoMode && <p className="rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">{t("settings.demoMode")}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          title={t("settings.email.title")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/app/admin/settings/email">
                {t("settings.email.open")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4">
            <p className="text-sm text-graphite">
              {mailboxes.length
                ? t("settings.email.connectedAs", { mailbox: mailboxes.join(", ") })
                : setup.anyReady
                  ? `${t("settings.email.notConnected")} ${t("settings.email.readyToConnect")}`
                  : `${t("settings.email.notConnected")} ${t("settings.email.notReady")}`}
            </p>
            <EmailSetupChecklist setup={setup} scopes={scopes} compact />
          </div>
        </Panel>

        <div className="grid content-start gap-6">
          <Panel title={t("settings.ai.title")}>
            <p className="text-sm text-graphite">{ai.on ? t("settings.ai.on") : t("settings.ai.off")}</p>
            {ai.model && <p className="mt-1 text-xs text-smoke">{t("settings.ai.model", { model: ai.model })}</p>}
          </Panel>
          <Panel
            title={t("settings.staff.title")}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/app/admin/users">
                  {t("settings.staff.open")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            }
          >
            <p className="text-sm text-graphite">{t("settings.staff.description")}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

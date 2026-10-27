/** /app/admin/settings: email connection, AI and staff accounts at a glance. Admins only. */
import { Link, useLoaderData } from "react-router";
import { ArrowRight } from "lucide-react";
import type { Route } from "./+types/app.admin.settings._index";
import { PageHeader, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { aiModel, isAiConfigured } from "~/lib/ai/client.server";
import { requireAdmin } from "~/lib/auth.server";
import { activeAccounts } from "~/lib/email/accounts.server";
import { emailSetup } from "~/lib/email/config.server";
import { cn } from "~/lib/utils";

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
    ai: { on: ai, model: ai ? aiModel() : null },
  };
}

export default function Settings() {
  const { setup, mailboxes, ai } = useLoaderData<typeof loader>();
  const { t } = useT();
  const missing = [...setup.shared, ...setup.providers.flatMap((p) => p.settings)].filter((x) => x.state !== "set").length;
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={t("settings.title")} />
      {setup.demoMode && <p className="rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">{t("settings.demoMode")}</p>}

      <Sheet className="px-4 py-1 md:px-5">
        <ul className="divide-y divide-stone">
          <SettingRow
            title={t("settings.email.title")}
            status={
              mailboxes.length
                ? t("settings.email.connectedAs", { mailbox: mailboxes.join(", ") })
                : missing === 0
                  ? `${t("settings.email.notConnected")} ${t("settings.email.readyToConnect")}`
                  : missing === 1
                    ? t("settings.email.missingOne")
                    : t("settings.email.missing", { count: missing })
            }
            warn={!mailboxes.length && missing > 0}
            to="/app/admin/settings/email"
            linkLabel={t("settings.email.open")}
          />
          <SettingRow
            title={t("settings.staff.title")}
            status={t("settings.staff.description")}
            to="/app/admin/users"
            linkLabel={t("settings.staff.open")}
          />
          <SettingRow
            title={t("settings.ai.title")}
            status={ai.on ? `${t("settings.ai.on")}${ai.model ? ` ${t("settings.ai.model", { model: ai.model })}` : ""}` : t("settings.ai.off")}
          />
        </ul>
      </Sheet>
    </div>
  );
}

function SettingRow({ title, status, warn, to, linkLabel }: { title: string; status: string; warn?: boolean; to?: string; linkLabel?: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4">
      <div className="min-w-0">
        <h2 className="font-medium">{title}</h2>
        <p className={cn("text-sm", warn ? "text-rust-ink" : "text-smoke")}>{status}</p>
      </div>
      {to && linkLabel && (
        <Button asChild variant="outline" size="sm">
          <Link to={to}>
            {linkLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </li>
  );
}

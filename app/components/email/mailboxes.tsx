/** Connected mailboxes on the email settings page: status, last sync, sync, disconnect and connect buttons. */
import { Form, useNavigation } from "react-router";
import { Mail, RefreshCw, Unplug } from "lucide-react";
import type { EmailAccountView } from "~/lib/email/accounts.server";
import type { EmailProvider, ProviderSetup } from "~/lib/email/config.server";
import { formatDateTime } from "~/components/admin/format";
import { Button } from "~/components/ui/button";
import { useT } from "~/i18n";
import { cn } from "~/lib/utils";

const STATUS_STYLE = {
  active: "bg-sage-soft text-sage-ink",
  needs_reconnect: "bg-rust-soft text-rust-ink",
  disconnected: "bg-stone text-smoke",
} as const;

export function SyncButton({ action, disabled }: { action?: string; disabled?: boolean }) {
  const { t } = useT();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" && navigation.formData?.get("intent") === "sync";
  return (
    <Form method="post" action={action}>
      <input type="hidden" name="intent" value="sync" />
      <Button type="submit" variant="outline" size="sm" disabled={disabled || busy}>
        <RefreshCw className={cn(busy && "animate-spin")} aria-hidden="true" />
        {t("email.sync.button")}
      </Button>
    </Form>
  );
}

export function ConnectButton({ provider, disabled, label }: { provider: EmailProvider; disabled?: boolean; label?: string }) {
  const { t } = useT();
  return (
    <Form method="post" action={`/app/admin/email/connect/${provider}`} reloadDocument>
      <Button type="submit" variant="outline" disabled={disabled}>
        <Mail aria-hidden="true" />
        {label ?? t("settings.accounts.connect", { provider: t(`settings.provider.${provider}`) })}
      </Button>
    </Form>
  );
}

export function MailboxList({
  accounts,
  providers,
  demoMode,
}: {
  accounts: EmailAccountView[];
  providers: ProviderSetup[];
  demoMode: boolean;
}) {
  const { t, locale } = useT();
  const ready = (p: EmailProvider) => !demoMode && (providers.find((x) => x.provider === p)?.ready ?? false);

  return (
    <div className="grid gap-4">
      {accounts.length === 0 ? (
        <p className="text-sm text-smoke">{t("settings.accounts.none")}</p>
      ) : (
        <ul className="grid gap-3">
          {accounts.map((a) => (
            <li key={a.id} className="grid gap-3 rounded-card bg-canvas p-4 shadow-whisper sm:flex sm:items-center sm:justify-between">
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{a.email_address}</span>
                  <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", STATUS_STYLE[a.status])}>
                    {t(`settings.accounts.status.${a.status}`)}
                  </span>
                </div>
                <p className="text-xs text-smoke">
                  {t(`settings.provider.${a.provider}`)}
                  {a.connected_by_name && <> · {t("settings.accounts.connectedBy", { name: a.connected_by_name })}</>}
                  {" · "}
                  {a.last_synced_at ? t("email.sync.last", { date: formatDateTime(a.last_synced_at, locale) }) : t("email.sync.never")}
                </p>
                {a.last_error && (a.last_error === "auth" || a.last_error === "busy" || a.last_error === "failed") && (
                  <p className="text-xs text-rust-ink">{t(`settings.accounts.lastError.${a.last_error}`)}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {a.status === "needs_reconnect" && (
                  <ConnectButton provider={a.provider} disabled={!ready(a.provider)} label={t("settings.accounts.reconnect")} />
                )}
                <Form
                  method="post"
                  onSubmit={(event) => {
                    if (!confirm(t("settings.accounts.disconnectConfirm", { mailbox: a.email_address }))) event.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="disconnect" />
                  <input type="hidden" name="accountId" value={a.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    <Unplug aria-hidden="true" />
                    {t("settings.accounts.disconnect")}
                  </Button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {providers.map((p) => (
          <ConnectButton key={p.provider} provider={p.provider} disabled={!ready(p.provider)} />
        ))}
        {accounts.some((a) => a.status === "active") && <SyncButton disabled={demoMode} />}
      </div>
    </div>
  );
}

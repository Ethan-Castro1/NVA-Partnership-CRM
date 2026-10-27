/**
 * The email setup checklist: which server settings are set, missing or not
 * valid (names only, never values), the redirect URI to register, and what
 * each provider asks for.
 */
import { useState } from "react";
import { Check, CircleAlert, CircleDashed, Copy } from "lucide-react";
import type { EmailProvider, EmailSetup, SettingState } from "~/lib/email/config.server";
import { useT, type MessageKey } from "~/i18n";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const STATE_STYLE: Record<SettingState["state"], string> = {
  set: "bg-sage-soft text-sage-ink",
  missing: "bg-rust-soft text-rust-ink",
  invalid: "bg-gold-soft text-gold-ink",
};

function SettingRow({ setting }: { setting: SettingState }) {
  const { t } = useT();
  const Icon = setting.state === "set" ? Check : setting.state === "missing" ? CircleDashed : CircleAlert;
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2">
      <div className="grid min-w-0 gap-0.5">
        <code className="font-mono text-[0.8rem] font-semibold break-all">{setting.name}</code>
        <span className="text-xs text-smoke">{t(`settings.checklist.hint.${setting.name}` as MessageKey)}</span>
      </div>
      <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[0.72rem] font-medium", STATE_STYLE[setting.state])}>
        <Icon className="size-3.5" aria-hidden="true" />
        {t(`settings.checklist.state.${setting.state}`)}
      </span>
    </li>
  );
}

export function CopyValue({ value }: { value: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-stone bg-canvas px-3 py-2">
      <code className="min-w-0 flex-1 font-mono text-[0.8rem] break-all">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => setCopied(true));
        }}
      >
        <Copy aria-hidden="true" />
        {copied ? t("settings.checklist.copied") : t("settings.checklist.copy")}
      </Button>
    </div>
  );
}

export function EmailSetupChecklist({
  setup,
  scopes,
  compact = false,
}: {
  setup: EmailSetup;
  scopes: Record<EmailProvider, string[]>;
  compact?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="grid gap-4">
      {!compact && <p className="text-sm text-smoke">{t("settings.checklist.description")}</p>}

      <div className="rounded-card bg-canvas p-4 shadow-whisper">
        <h3 className="text-sm font-semibold">{t("settings.checklist.shared")}</h3>
        <ul className="divide-y divide-stone">
          {setup.shared.map((s) => (
            <SettingRow key={s.name} setting={s} />
          ))}
        </ul>
        <div className="mt-3 grid gap-1.5">
          <p className="text-sm font-medium">{t("settings.checklist.redirect")}</p>
          {setup.redirectUri ? (
            <CopyValue value={setup.redirectUri} />
          ) : (
            <p className="text-xs text-smoke">{t("settings.checklist.redirectPending", { path: setup.callbackPath })}</p>
          )}
        </div>
      </div>

      <div className={cn("grid gap-4", !compact && "lg:grid-cols-2")}>
        {setup.providers.map((p) => (
          <div key={p.provider} className="rounded-card bg-canvas p-4 shadow-whisper">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {t(`settings.provider.${p.provider}`)}
                {p.provider === "google" && (
                  <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-[0.7rem] font-medium text-gold-ink">
                    {t("settings.provider.recommended")}
                  </span>
                )}
              </h3>
              <span className={cn("text-xs font-medium", p.ready ? "text-sage-ink" : "text-smoke")}>
                {p.ready ? t("settings.email.readyToConnect") : t("settings.email.notReady")}
              </span>
            </div>
            <ul className="divide-y divide-stone">
              {p.settings.map((s) => (
                <SettingRow key={s.name} setting={s} />
              ))}
            </ul>
            {!compact && (
              <div className="mt-3 grid gap-2 text-xs text-smoke">
                <p>{t(p.provider === "google" ? "settings.provider.googleSteps" : "settings.provider.microsoftSteps")}</p>
                <div>
                  <p className="font-medium text-graphite">{t("settings.checklist.scopes")}</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {scopes[p.provider].map((scope) => (
                      <li key={scope} className="rounded-full bg-taupe px-2 py-0.5 font-mono text-[0.7rem] break-all">
                        {scope}
                      </li>
                    ))}
                  </ul>
                </div>
                {p.provider === "microsoft" && <p>{t("settings.checklist.tenant")}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

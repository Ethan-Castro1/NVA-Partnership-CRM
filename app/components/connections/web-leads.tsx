/**
 * "Search beyond our network": the web search form and the unverified leads
 * it produces. Leads are always labelled as unverified, their source links
 * open in a new tab without a referrer, and saving one only creates a 'lead'
 * contact (never a relationship).
 */
import { Form, Link, useFetcher, useNavigation } from "react-router";
import { ExternalLink, Globe, Loader2, Search, UserPlus, X } from "lucide-react";
import { Field, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useT, type MessageKey } from "~/i18n";
import type { WebLeadView } from "~/lib/ai/web-leads.server";

export type WebActionResult =
  | { intent: "web"; ok: true; count: number }
  | { intent: "web"; ok: false; error: MessageKey; field?: "need" | "via" };

export function WebSearchForm({
  aiConfigured,
  innerCircle,
  defaultNeed,
  result,
}: {
  aiConfigured: boolean;
  innerCircle: { id: string; full_name: string }[];
  defaultNeed: string;
  result?: WebActionResult;
}) {
  const { t } = useT();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting" && navigation.formData?.get("intent") === "web";
  const disabled = !aiConfigured || busy;
  const fieldError = result && !result.ok && result.field ? result : null;

  return (
    <div className="grid gap-4">
      {!aiConfigured && (
        <p className="flex items-start gap-2 rounded-xl bg-gold-soft px-3.5 py-2.5 text-sm text-graphite">
          <Search className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden="true" />
          {t("connections.web.error.notConfigured")}
        </p>
      )}
      <Form method="post" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem_auto] md:items-end" aria-busy={busy}>
        <input type="hidden" name="intent" value="web" />
        <Field
          label={t("connections.web.needLabel")}
          htmlFor="web-need"
          error={fieldError?.field === "need" ? t(fieldError.error) : undefined}
        >
          <Input
            id="web-need"
            name="need"
            required
            minLength={3}
            maxLength={300}
            defaultValue={defaultNeed}
            placeholder={t("connections.web.needPlaceholder")}
            disabled={!aiConfigured}
            aria-invalid={fieldError?.field === "need" || undefined}
          />
        </Field>
        <Field
          label={t("connections.web.viaLabel")}
          htmlFor="web-via"
          optional
          hint={t("connections.web.viaHint")}
          error={fieldError?.field === "via" ? t(fieldError.error) : undefined}
        >
          <Select name="via" defaultValue="none" disabled={!aiConfigured}>
            <SelectTrigger id="web-via" className="h-10 w-full bg-canvas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("connections.web.viaNone")}</SelectItem>
              {innerCircle.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" variant="default" className="h-10" disabled={disabled}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Globe aria-hidden="true" />}
          {t("connections.web.submit")}
        </Button>
      </Form>

      <div aria-live="polite" className="empty:hidden">
        {busy ? (
          <p className="text-sm text-graphite">{t("connections.web.submitting")}</p>
        ) : result?.ok ? (
          <p className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
            {result.count === 0
              ? t("connections.web.foundNone")
              : result.count === 1
                ? t("connections.web.foundOne")
                : t("connections.web.found", { count: result.count })}
          </p>
        ) : result && !result.ok && !result.field ? (
          <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
            {t(result.error)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function WebLeadCard({ lead }: { lead: WebLeadView }) {
  const { t } = useT();
  const fetcher = useFetcher<{ intent: string; ok: boolean; error?: MessageKey; personId?: string }>();
  const pendingIntent = fetcher.state !== "idle" ? fetcher.formData?.get("intent") : null;
  const subtitle = [lead.role_title, lead.organization].filter(Boolean).join(", ");
  const savedId = lead.saved_person_id ?? (fetcher.data?.ok ? fetcher.data.personId : undefined);
  const error = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok ? fetcher.data.error : undefined;

  return (
    <Sheet className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-sans text-base font-bold tracking-normal">{lead.name}</h3>
          {subtitle && <p className="text-sm text-smoke">{subtitle}</p>}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-purple bg-purple-soft px-2.5 py-0.5 text-xs font-medium text-purple-ink">
          <Globe className="size-3.5" aria-hidden="true" />
          {t("connections.leads.unverified")}
        </span>
      </div>

      {lead.summary && <p className="text-sm text-graphite">{lead.summary}</p>}
      {lead.why_relevant && (
        <p className="text-sm text-graphite">
          <span className="font-medium text-ink">{t("connections.leads.whyRelevant")}:</span> {lead.why_relevant}
        </p>
      )}
      {lead.via_person_name && (
        <p className="text-sm text-graphite">
          <span className="font-medium text-ink">{t("connections.leads.via", { name: lead.via_person_name })}</span>
          {lead.via_note ? `. ${lead.via_note}` : ""}
        </p>
      )}

      {lead.source_urls.length > 0 && (
        <div className="grid gap-1">
          <p className="text-eyebrow text-smoke">{t("connections.leads.sources")}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {lead.source_urls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-sm text-blue-ink underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {hostname(url)}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{t("connections.leads.opensNewTab")}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone pt-3">
        <p className="text-xs text-smoke">{t("connections.leads.query", { q: lead.query })}</p>
        {savedId ? (
          <p className="flex items-center gap-2 text-sm text-sage-ink">
            {t("connections.leads.saved")}
            <Link to={`/app/people/${savedId}`} className="font-medium text-ink underline decoration-gold decoration-2 underline-offset-4">
              {t("connections.leads.openProfile")}
            </Link>
          </p>
        ) : (
          <fetcher.Form method="post" className="flex flex-wrap gap-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <Button
              type="submit"
              name="intent"
              value="dismiss-lead"
              variant="ghost"
              size="sm"
              disabled={!!pendingIntent}
              aria-label={t("connections.leads.dismissFor", { name: lead.name })}
            >
              <X aria-hidden="true" />
              {t("connections.leads.dismiss")}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="save-lead"
              variant="outline"
              size="sm"
              disabled={!!pendingIntent}
              aria-label={t("connections.leads.saveFor", { name: lead.name })}
            >
              {pendingIntent === "save-lead" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
              {pendingIntent === "save-lead" ? t("connections.leads.saving") : t("connections.leads.save")}
            </Button>
          </fetcher.Form>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-rust-ink">
          {t(error)}
        </p>
      )}
    </Sheet>
  );
}

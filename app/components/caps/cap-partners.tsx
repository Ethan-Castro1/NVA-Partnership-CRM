/**
 * A CAP's partners and the suggested partners. For admins, rows are
 * inline-editable and suggestions have an Add button (fetchers save in place).
 * Staff get read-only rows and the usual Contact or Request Introduction actions.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useFetcher } from "react-router";
import { Check, CircleDashed, Loader2, Mail, NotebookPen, Plus, Route as RouteIcon, Trash2 } from "lucide-react";
import { PersonAvatar } from "~/components/nva";
import { ResourceActions } from "~/components/resources/resource-actions";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useT } from "~/i18n";
import { CAP_PARTNER_STATUSES, type CapPartnerStatus } from "~/lib/constants";
import type { CapPartnerView, CapSuggestion } from "~/lib/caps.server";
import { cn } from "~/lib/utils";
import { useTopicLabel } from "./cap-bits";

const PARTNER_STATUS_DOT: Record<CapPartnerStatus, string> = {
  suggested: "bg-gold",
  contacted: "bg-blue",
  confirmed: "bg-sage",
  declined: "bg-ash",
};

type FetcherResult = { ok: boolean; error?: string };

const ICON_LINK =
  "inline-flex size-7 items-center justify-center rounded-full text-graphite transition-colors hover:bg-stone hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-3.5";

export function PartnerRow({
  partner,
  capId,
  editable = true,
  saved = false,
}: {
  partner: CapPartnerView;
  capId: string;
  /** Admins edit status, role and note in place; staff see them read-only. */
  editable?: boolean;
  saved?: boolean;
}) {
  if (!editable) return <ReadOnlyPartnerRow partner={partner} capId={capId} saved={saved} />;
  return <EditablePartnerRow partner={partner} capId={capId} />;
}

function ReadOnlyPartnerRow({ partner, capId, saved }: { partner: CapPartnerView; capId: string; saved: boolean }) {
  const { t } = useT();
  const { person } = partner;
  const subtitle = [person.title, person.organization_name].filter(Boolean).join(", ");
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2.7fr)] md:items-start md:gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <PersonAvatar name={person.full_name} />
        <div className="min-w-0">
          <Link
            to={`/app/people/${person.id}`}
            className="font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {person.full_name}
          </Link>
          {subtitle && <p className="truncate text-xs text-smoke">{subtitle}</p>}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite">
            <span className={cn("size-2 rounded-full", PARTNER_STATUS_DOT[partner.status])} aria-hidden="true" />
            {t(`common.capPartnerStatus.${partner.status}`)}
          </p>
        </div>
      </div>
      <div className="grid min-w-0 gap-2">
        {(partner.role || partner.note) && (
          <dl className="grid gap-1 text-sm">
            {partner.role && (
              <div className="flex gap-1.5">
                <dt className="text-smoke">{t("caps.partners.role")}:</dt>
                <dd className="text-graphite">{partner.role}</dd>
              </div>
            )}
            {partner.note && (
              <div className="flex gap-1.5">
                <dt className="text-smoke">{t("caps.partners.note")}:</dt>
                <dd className="text-graphite">{partner.note}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <ResourceActions person={person} saved={saved} compact />
          <Link
            to={`/app/people/${person.id}?logCap=${encodeURIComponent(capId)}#log-activity`}
            className={ICON_LINK}
            aria-label={t("caps.partners.logFor", { name: person.full_name })}
            title={t("caps.partners.logFor", { name: person.full_name })}
          >
            <NotebookPen aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function EditablePartnerRow({ partner, capId }: { partner: CapPartnerView; capId: string }) {
  const { t } = useT();
  const save = useFetcher<FetcherResult>();
  const remove = useFetcher<FetcherResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const lastSaved = useRef({ role: partner.role ?? "", note: partner.note ?? "" });
  const [showSaved, setShowSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const id = partner.person.id;
  const name = partner.person.full_name;
  const saving = save.state !== "idle";
  const saved = save.state === "idle" && save.data?.ok;
  const removing = remove.state !== "idle";
  const subtitle = [partner.person.title, partner.person.organization_name].filter(Boolean).join(", ");
  const status = (save.formData?.get("status") as CapPartnerStatus | null) ?? partner.status;

  useEffect(() => {
    if (!saved) return;
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved, save.data]);

  /** Role and note save when the field loses focus, only if the text changed. */
  // Enter saves too (the row has no Save button; fields save when you leave them).
  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  function saveField(field: "role" | "note", value: string) {
    if (!formRef.current || value === lastSaved.current[field]) return;
    lastSaved.current[field] = value;
    save.submit(formRef.current, { method: "post" });
  }

  return (
    <li className={cn("grid gap-3 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2.7fr)] md:items-start md:gap-5", removing && "opacity-50")}>
      <div className="flex min-w-0 items-start gap-3">
        <PersonAvatar name={name} />
        <div className="min-w-0">
          <Link
            to={`/app/people/${id}`}
            className="font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {name}
          </Link>
          {subtitle && <p className="truncate text-xs text-smoke">{subtitle}</p>}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite">
            <span className={cn("size-2 rounded-full", PARTNER_STATUS_DOT[status])} aria-hidden="true" />
            {t(`common.capPartnerStatus.${status}`)}
          </p>
          <div className="mt-1 -ml-1.5 flex items-center gap-0.5">
            {partner.person.email && (
              <a
                href={`mailto:${partner.person.email}`}
                className={ICON_LINK}
                aria-label={t("caps.partners.emailFor", { name })}
                title={t("caps.partners.emailFor", { name })}
              >
                <Mail aria-hidden="true" />
              </a>
            )}
            <Link
              to={`/app/people/${id}?logCap=${encodeURIComponent(capId)}#log-activity`}
              className={ICON_LINK}
              aria-label={t("caps.partners.logFor", { name })}
              title={t("caps.partners.logFor", { name })}
            >
              <NotebookPen aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>

      <save.Form ref={formRef} method="post" className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-end">
        <input type="hidden" name="intent" value="update-partner" />
        <input type="hidden" name="personId" value={id} />
        <div className="grid gap-1">
          <Label htmlFor={`status-${id}`} className="text-xs text-smoke">
            {t("caps.partners.status")}
          </Label>
          <Select
            name="status"
            defaultValue={partner.status}
            onValueChange={(value) => {
              if (!formRef.current) return;
              const form = new FormData(formRef.current);
              form.set("status", value);
              save.submit(form, { method: "post" });
            }}
          >
            <SelectTrigger id={`status-${id}`} className="h-9 w-full bg-canvas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAP_PARTNER_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  <span className={cn("size-2 rounded-full", PARTNER_STATUS_DOT[value])} aria-hidden="true" />
                  {t(`common.capPartnerStatus.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`role-${id}`} className="text-xs text-smoke">
            {t("caps.partners.role")}
          </Label>
          <Input
            id={`role-${id}`}
            name="role"
            maxLength={120}
            defaultValue={partner.role ?? ""}
            placeholder={t("caps.partners.rolePlaceholder")}
            className="h-9"
            onBlur={(event) => saveField("role", event.currentTarget.value)}
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`note-${id}`} className="text-xs text-smoke">
            {t("caps.partners.note")}
          </Label>
          <Input
            id={`note-${id}`}
            name="note"
            maxLength={500}
            defaultValue={partner.note ?? ""}
            placeholder={t("caps.partners.notePlaceholder")}
            className="h-9"
            onBlur={(event) => saveField("note", event.currentTarget.value)}
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="flex h-9 items-center justify-end gap-1">
          {saving ? (
            <Loader2 className="size-4 animate-spin text-smoke" aria-hidden="true" />
          ) : showSaved ? (
            <span className="inline-flex items-center gap-1 text-xs text-sage-ink" aria-hidden="true">
              <Check className="size-3.5" />
              {t("caps.partners.saved")}
            </span>
          ) : null}
          {confirming ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-rust-ink"
              autoFocus
              disabled={removing}
              onBlur={() => setConfirming(false)}
              onClick={() => remove.submit({ intent: "remove-partner", personId: id }, { method: "post" })}
              aria-label={t("caps.partners.removeFor", { name })}
            >
              {t("caps.partners.confirmRemove")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={removing}
              onClick={() => setConfirming(true)}
              aria-label={t("caps.partners.removeFor", { name })}
              title={t("caps.partners.remove")}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </save.Form>
      <p className="sr-only" aria-live="polite">
        {saved ? t("caps.partners.saved") : ""}
      </p>
    </li>
  );
}

function pathSummary(suggestion: CapSuggestion, t: ReturnType<typeof useT>["t"]): string {
  if (suggestion.direct) return t("caps.suggest.direct");
  const best = suggestion.paths[0];
  if (!best) return t("caps.suggest.noPath");
  if (best.degree === 1) return t("caps.suggest.viaOne", { name: best.chain[0].full_name });
  return t("caps.suggest.viaTwo", { a: best.chain[0].full_name, b: best.chain[1].full_name });
}

export function SuggestionItem({
  suggestion,
  canAdd = true,
  saved = false,
}: {
  suggestion: CapSuggestion;
  /** Admins add suggestions as partners; staff get Contact or Request Introduction. */
  canAdd?: boolean;
  saved?: boolean;
}) {
  const { t } = useT();
  const fetcher = useFetcher<FetcherResult>();
  const adding = fetcher.state !== "idle";
  const { person } = suggestion;
  const subtitle = [person.title, person.organization_name].filter(Boolean).join(", ");
  const reachable = suggestion.direct || suggestion.paths.length > 0;
  const topicLabel = useTopicLabel();
  const matched = suggestion.matched.map(topicLabel);

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Link
          to={`/app/people/${person.id}`}
          className="truncate font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {person.full_name}
        </Link>
        <p className={cn("flex min-w-0 items-center gap-1.5 text-xs", reachable ? "text-graphite" : "text-smoke")} title={matched.join(", ") || undefined}>
          {reachable ? (
            <RouteIcon className="size-3.5 shrink-0 text-gold-ink" aria-hidden="true" />
          ) : (
            <CircleDashed className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{[subtitle, pathSummary(suggestion, t)].filter(Boolean).join(" · ")}</span>
        </p>
      </div>
      {!canAdd ? (
        <ResourceActions person={person} saved={saved} compact className="shrink-0" />
      ) : (
        <fetcher.Form method="post" className="shrink-0">
          <input type="hidden" name="intent" value="add-partner" />
          <input type="hidden" name="personId" value={person.id} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={adding}
            aria-label={t("caps.suggest.addFor", { name: person.full_name })}
          >
            {adding ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {adding ? t("caps.suggest.adding") : t("caps.suggest.add")}
          </Button>
        </fetcher.Form>
      )}
    </li>
  );
}

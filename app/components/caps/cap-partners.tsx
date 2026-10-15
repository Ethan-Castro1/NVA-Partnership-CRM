/**
 * A CAP's partners (inline-editable rows) and the suggested partners to add.
 * Both use fetchers so a change saves in place without leaving the page.
 */
import { useRef } from "react";
import { Link, useFetcher } from "react-router";
import { Check, CircleDashed, Loader2, Plus, Route as RouteIcon, Trash2 } from "lucide-react";
import { ContributionChips, PersonAvatar, StatusBadge, TagList } from "~/components/nva";
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

export function PartnerRow({ partner }: { partner: CapPartnerView }) {
  const { t } = useT();
  const save = useFetcher<FetcherResult>();
  const remove = useFetcher<FetcherResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const id = partner.person.id;
  const saving = save.state !== "idle";
  const saved = save.state === "idle" && save.data?.ok;
  const removing = remove.state !== "idle";
  const subtitle = [partner.person.title, partner.person.organization_name].filter(Boolean).join(", ");
  const status = (save.formData?.get("status") as CapPartnerStatus | null) ?? partner.status;

  return (
    <li className={cn("grid gap-3 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2.7fr)] md:items-start md:gap-5", removing && "opacity-50")}>
      <div className="flex min-w-0 items-start gap-3">
        <PersonAvatar name={partner.person.full_name} />
        <div className="min-w-0">
          <Link
            to={`/app/people/${id}`}
            className="font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {partner.person.full_name}
          </Link>
          {subtitle && <p className="truncate text-xs text-smoke">{subtitle}</p>}
          <p className="mt-1 flex items-center gap-1.5 text-xs text-graphite">
            <span className={cn("size-2 rounded-full", PARTNER_STATUS_DOT[status])} aria-hidden="true" />
            {t(`common.capPartnerStatus.${status}`)}
          </p>
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
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={saving}
            aria-label={t("caps.partners.saveFor", { name: partner.person.full_name })}
          >
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : saved ? <Check aria-hidden="true" /> : null}
            {saved && !saving ? t("caps.partners.saved") : t("caps.partners.save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={removing}
            onClick={() => remove.submit({ intent: "remove-partner", personId: id }, { method: "post" })}
            aria-label={t("caps.partners.removeFor", { name: partner.person.full_name })}
            title={t("caps.partners.remove")}
          >
            <Trash2 aria-hidden="true" />
          </Button>
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

export function SuggestionItem({ suggestion }: { suggestion: CapSuggestion }) {
  const { t } = useT();
  const fetcher = useFetcher<FetcherResult>();
  const adding = fetcher.state !== "idle";
  const { person } = suggestion;
  const subtitle = [person.title, person.organization_name].filter(Boolean).join(", ");
  const reachable = suggestion.direct || suggestion.paths.length > 0;
  const topicLabel = useTopicLabel();
  const matched = suggestion.matched.map(topicLabel);

  return (
    <li className="grid gap-2.5 py-4">
      <div className="flex items-start gap-3">
        <PersonAvatar name={person.full_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/app/people/${person.id}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {person.full_name}
            </Link>
            <StatusBadge status={person.status} />
          </div>
          {subtitle && <p className="text-xs text-smoke">{subtitle}</p>}
        </div>
      </div>
      <ContributionChips types={person.contribution_types} />
      {matched.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-smoke">{t("caps.suggest.matched")}:</span>
          <TagList tags={matched} highlight={matched} />
        </div>
      )}
      <p className={cn("flex items-start gap-1.5 text-xs", reachable ? "text-graphite" : "text-smoke")}>
        {reachable ? (
          <RouteIcon className="mt-px size-3.5 shrink-0 text-gold-ink" aria-hidden="true" />
        ) : (
          <CircleDashed className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        )}
        {pathSummary(suggestion, t)}
      </p>
      <fetcher.Form method="post">
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
    </li>
  );
}

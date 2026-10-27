/**
 * A short "add a follow-up" form that saves in place (fetcher to
 * /app/follow-ups/action, intent "create"; admin only).
 *
 * Props:
 * - today: schoolToday() from the loader. The due date starts a week later.
 * - personId: the person it is for (a profile or opportunity page). Leave it out to show a person picker.
 * - people: options for the person picker ({ id, full_name, organization_name }), when personId is not given.
 * - opportunityId: link it to this opportunity (hidden field).
 * - opportunities: options ({ id, title }) to pick an opportunity, when opportunityId is not given.
 * - owners: admins to assign it to ({ id, name }); hidden when empty. defaultOwnerId picks one (default: the server uses you).
 * - submitVariant: "brand" (gold, the screen's one CRM action) or "default" (dark). Default "default".
 * - onDone: called after it saved (for example to close a panel).
 * - className
 */
import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Plus } from "lucide-react";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useT } from "~/i18n";
import { addDays } from "~/lib/dates";
import type { NamedOption, PersonOption } from "~/lib/opportunities.server";
import { cn } from "~/lib/utils";
import { CrmSelect, MoreDetails } from "./crm-bits";
import { FOLLOW_UP_ACTION, type FollowUpActionResult } from "./follow-up-list";

export type QuickFollowUpFormProps = {
  today: string;
  personId?: string;
  people?: PersonOption[];
  opportunityId?: string;
  opportunities?: { id: string; title: string }[];
  owners?: NamedOption[];
  defaultOwnerId?: string;
  submitVariant?: "brand" | "default";
  onDone?: () => void;
  className?: string;
};

export function QuickFollowUpForm({
  today,
  personId,
  people,
  opportunityId,
  opportunities,
  owners,
  defaultOwnerId,
  submitVariant = "default",
  onDone,
  className,
}: QuickFollowUpFormProps) {
  const { t } = useT();
  const uid = useId();
  const fetcher = useFetcher<FollowUpActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [added, setAdded] = useState(false);
  const busy = fetcher.state !== "idle";
  const errors = fetcher.state === "idle" && fetcher.data?.ok === false ? (fetcher.data.errors ?? {}) : {};
  const failed = fetcher.state === "idle" && fetcher.data?.ok === false && !fetcher.data.errors ? fetcher.data.error : undefined;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) return;
    setFormKey((k) => k + 1); // fresh, empty form (selects included)
    setAdded(true);
    onDone?.();
    const timer = setTimeout(() => setAdded(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const showOpportunities = !opportunityId && opportunities && opportunities.length > 0;
  const showOwners = owners && owners.length > 1;

  return (
    <fetcher.Form key={formKey} ref={formRef} method="post" action={FOLLOW_UP_ACTION} className={cn("grid gap-4", className)}>
      <input type="hidden" name="intent" value="create" />
      {personId && <input type="hidden" name="personId" value={personId} />}
      {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}

      {!personId && (
        <Field label={t("crm.fu.form.person")} htmlFor={`${uid}-person`} error={errors.personId && t(errors.personId)}>
          <CrmSelect
            id={`${uid}-person`}
            name="personId"
            required
            invalid={!!errors.personId}
            placeholder={t("crm.fu.form.personPlaceholder")}
            options={(people ?? []).map((p) => ({ value: p.id, label: p.organization_name ? `${p.full_name}, ${p.organization_name}` : p.full_name }))}
          />
        </Field>
      )}

      <Field label={t("crm.fu.form.action")} htmlFor={`${uid}-action`} error={errors.action && t(errors.action)}>
        <Input
          id={`${uid}-action`}
          name="action"
          required
          maxLength={500}
          aria-invalid={!!errors.action || undefined}
          placeholder={t("crm.fu.form.actionPlaceholder")}
          className="h-10 bg-canvas"
        />
      </Field>

      <Field label={t("crm.fu.form.dueOn")} htmlFor={`${uid}-due`} error={errors.dueOn && t(errors.dueOn)} className="sm:max-w-56">
        <Input id={`${uid}-due`} type="date" name="dueOn" required defaultValue={addDays(today, 7)} className="h-10 bg-canvas" />
      </Field>

      <MoreDetails label={t("crm.moreDetails")}>
        {(showOwners || showOpportunities) && (
          <div className={cn("grid gap-4", showOpportunities && showOwners && "sm:grid-cols-2")}>
            {showOwners && (
              <Field label={t("crm.fu.form.owner")} htmlFor={`${uid}-owner`}>
                <CrmSelect
                  id={`${uid}-owner`}
                  name="ownerUserId"
                  defaultValue={defaultOwnerId}
                  placeholder={t("crm.fu.form.owner")}
                  options={owners.map((o) => ({ value: o.id, label: o.name }))}
                />
              </Field>
            )}
            {showOpportunities && (
              <Field label={t("crm.fu.form.opportunity")} htmlFor={`${uid}-opp`}>
                <CrmSelect
                  id={`${uid}-opp`}
                  name="opportunityId"
                  defaultValue="none"
                  options={[{ value: "none", label: t("crm.fu.form.noOpportunity") }, ...opportunities.map((o) => ({ value: o.id, label: o.title }))]}
                />
              </Field>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox id={`${uid}-awaiting`} name="awaitingResponse" />
          <Label htmlFor={`${uid}-awaiting`} className="text-sm font-normal text-graphite">
            {t("crm.fu.form.awaiting")}
          </Label>
        </div>
      </MoreDetails>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={submitVariant} disabled={busy}>
          <Plus aria-hidden="true" />
          {busy ? t("crm.fu.form.submitting") : t("crm.fu.form.submit")}
        </Button>
        <span aria-live="polite" className="text-sm text-sage-ink">
          {added ? t("crm.fu.form.added") : ""}
        </span>
        {failed && (
          <span role="alert" className="text-sm font-medium text-destructive">
            {t(failed)}
          </span>
        )}
      </div>
    </fetcher.Form>
  );
}

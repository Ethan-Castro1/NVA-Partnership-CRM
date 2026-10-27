/**
 * The opportunity form (new and edit). Choosing a track swaps the kinds and
 * stages to that track's own list. Posts with a normal <Form> to the page's action.
 */
import { useId, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useT } from "~/i18n";
import { KINDS_BY_TRACK, OPPORTUNITY_TRACKS, STAGES_BY_TRACK, type OpportunityTrack } from "~/lib/constants";
import type { NamedOption, OpportunityFormErrors, PersonOption } from "~/lib/opportunities.server";
import { cn } from "~/lib/utils";
import { CrmSelect } from "./crm-bits";

export type OpportunityFormValues = {
  personId?: string | null;
  track?: OpportunityTrack;
  kind?: string;
  stage?: string;
  title?: string;
  amount?: string | null;
  targetDate?: string | null;
  capId?: string | null;
  ownerUserId?: string | null;
  notes?: string | null;
};

export function OpportunityForm({
  people,
  caps,
  owners,
  values = {},
  errors = {},
  intent,
  submitLabel,
  pendingLabel,
  submitVariant = "default",
  cancelTo,
  onCancel,
}: {
  people: PersonOption[];
  caps: NamedOption[];
  owners: NamedOption[];
  values?: OpportunityFormValues;
  errors?: OpportunityFormErrors;
  intent?: string;
  submitLabel: string;
  pendingLabel: string;
  submitVariant?: "brand" | "default";
  cancelTo?: string;
  onCancel?: () => void;
}) {
  const { t } = useT();
  const uid = useId();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting" && (!intent || navigation.formData?.get("intent") === intent);
  const [track, setTrack] = useState<OpportunityTrack>(values.track ?? "engagement");
  const sameTrack = track === (values.track ?? "engagement");
  const err = (key: keyof OpportunityFormErrors) => (errors[key] ? t(errors[key]!) : undefined);

  return (
    <Form method="post" className="grid gap-5">
      {intent && <input type="hidden" name="intent" value={intent} />}

      <Field label={t("crm.opps.form.person")} htmlFor={`${uid}-person`} error={err("personId")}>
        <CrmSelect
          id={`${uid}-person`}
          name="personId"
          required
          invalid={!!errors.personId}
          defaultValue={values.personId ?? undefined}
          placeholder={t("crm.opps.form.personPlaceholder")}
          options={people.map((p) => ({ value: p.id, label: p.organization_name ? `${p.full_name}, ${p.organization_name}` : p.full_name }))}
        />
      </Field>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-graphite">{t("crm.opps.form.track")}</legend>
        <div className="inline-flex w-fit rounded-full border border-stone bg-taupe p-1">
          {OPPORTUNITY_TRACKS.map((value) => (
            <label
              key={value}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-full px-4 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                track === value ? "bg-canvas font-medium text-ink shadow-whisper" : "text-graphite hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="track"
                value={value}
                checked={track === value}
                onChange={() => setTrack(value)}
                className="sr-only"
              />
              {t(`common.track.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label={t("crm.opps.form.title")} htmlFor={`${uid}-title`} error={err("title")}>
        <Input
          id={`${uid}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={values.title ?? ""}
          aria-invalid={!!errors.title || undefined}
          placeholder={t("crm.opps.form.titlePlaceholder")}
          className="h-10 bg-canvas"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("crm.opps.form.kind")} htmlFor={`${uid}-kind`} error={err("kind")}>
          <CrmSelect
            key={`kind-${track}`}
            id={`${uid}-kind`}
            name="kind"
            required
            invalid={!!errors.kind}
            defaultValue={sameTrack && values.kind ? values.kind : KINDS_BY_TRACK[track][0]}
            options={KINDS_BY_TRACK[track].map((k) => ({ value: k, label: t(`common.opportunityKind.${k}`) }))}
          />
        </Field>
        <Field label={t("crm.opps.form.stage")} htmlFor={`${uid}-stage`} error={err("stage")}>
          <CrmSelect
            key={`stage-${track}`}
            id={`${uid}-stage`}
            name="stage"
            required
            invalid={!!errors.stage}
            defaultValue={sameTrack && values.stage ? values.stage : STAGES_BY_TRACK[track][0]}
            options={STAGES_BY_TRACK[track].map((s) => ({ value: s, label: t(`common.stage.${s}`) }))}
          />
        </Field>
        <Field label={t("crm.opps.form.targetDate")} htmlFor={`${uid}-target`} error={err("targetDate")} optional>
          <Input id={`${uid}-target`} type="date" name="targetDate" defaultValue={values.targetDate ?? ""} className="h-10 bg-canvas" />
        </Field>
        <Field
          label={t("crm.opps.form.amount")}
          htmlFor={`${uid}-amount`}
          hint={t("crm.opps.form.amountHint")}
          error={err("amount")}
          optional
        >
          <Input id={`${uid}-amount`} name="amount" maxLength={60} defaultValue={values.amount ?? ""} className="h-10 bg-canvas" />
        </Field>
        <Field label={t("crm.opps.form.cap")} htmlFor={`${uid}-cap`} optional>
          <CrmSelect
            id={`${uid}-cap`}
            name="capId"
            defaultValue={values.capId ?? "none"}
            options={[{ value: "none", label: t("crm.opps.form.noCap") }, ...caps.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>
        <Field label={t("crm.opps.form.owner")} htmlFor={`${uid}-owner`}>
          <CrmSelect
            id={`${uid}-owner`}
            name="ownerUserId"
            defaultValue={values.ownerUserId ?? "none"}
            options={[{ value: "none", label: t("crm.opps.form.noOwner") }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
          />
        </Field>
      </div>

      <Field label={t("crm.opps.form.notes")} htmlFor={`${uid}-notes`} hint={t("crm.opps.form.notesHint")} error={err("notes")} optional>
        <Textarea id={`${uid}-notes`} name="notes" rows={4} maxLength={4000} defaultValue={values.notes ?? ""} className="bg-canvas" />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={submitVariant} size="lg" disabled={busy}>
          {busy ? pendingLabel : submitLabel}
        </Button>
        {cancelTo && (
          <Button asChild variant="ghost" size="lg">
            <Link to={cancelTo}>{t("crm.opps.form.cancel")}</Link>
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
            {t("crm.opps.form.cancel")}
          </Button>
        )}
      </div>
    </Form>
  );
}

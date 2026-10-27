/**
 * The short staff request form (also used to edit a request's details).
 *
 * Props:
 * - caps: CAPs for "Related CAP" (listCapOptions()).
 * - people: who can be picked as "Someone in mind?" (listPersonOptions(viewer)).
 *   Omit it to hide the contact and introduction fields (editing).
 * - defaults: starting values (field names as in RequestInput).
 * - errors: RequestErrors from createRequest / updateRequestDetails.
 * - intent: optional hidden intent value posted with the form.
 * - submitLabel / pendingLabel / cancelTo.
 * - brand: whether the submit is the screen's one gold button (default true).
 */
import { Form, Link, useNavigation } from "react-router";
import { useState } from "react";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useT, type MessageKey } from "~/i18n";
import type { CapOption, PersonOption, RequestErrors } from "~/lib/requests.server";
import { NativeSelect } from "./request-bits";

export type RequestFormDefaults = {
  need?: string;
  description?: string | null;
  capId?: string | null;
  activity?: string | null;
  preferredDate?: string | null;
  timeframe?: string | null;
  participantCount?: number | string | null;
  personId?: string | null;
  intro?: boolean;
};

export type RequestFormProps = {
  caps: CapOption[];
  people?: PersonOption[];
  defaults?: RequestFormDefaults;
  errors?: RequestErrors;
  intent?: string;
  submitLabel: string;
  pendingLabel: string;
  cancelTo: string;
  brand?: boolean;
};

export function RequestForm({ caps, people, defaults = {}, errors = {}, intent, submitLabel, pendingLabel, cancelTo, brand = true }: RequestFormProps) {
  const { t } = useT();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [personId, setPersonId] = useState(defaults.personId ?? "");
  const err = (key: keyof RequestErrors) => (errors[key] ? t(errors[key] as MessageKey) : undefined);

  return (
    <Form method="post" className="grid gap-5" noValidate>
      {intent && <input type="hidden" name="intent" value={intent} />}
      <Field label={t("requests.form.need")} htmlFor="need" error={err("need")}>
        <Input
          id="need"
          name="need"
          required
          maxLength={200}
          defaultValue={defaults.need ?? ""}
          placeholder={t("requests.form.needPlaceholder")}
          aria-invalid={errors.need ? true : undefined}
          autoFocus={!defaults.need}
        />
      </Field>
      <Field label={t("requests.form.description")} htmlFor="description" optional error={err("description")}>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={defaults.description ?? ""}
          placeholder={t("requests.form.descriptionPlaceholder")}
        />
      </Field>

      {people && (
        <div className="grid gap-3 rounded-card border border-stone p-4">
          <Field label={t("requests.form.person")} htmlFor="personId" optional error={err("personId")}>
            <NativeSelect
              id="personId"
              name="personId"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              aria-invalid={errors.personId ? true : undefined}
            >
              <option value="">{t("requests.form.personNone")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.organization_name ? `${p.full_name} (${p.organization_name})` : p.full_name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {personId && (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="intro" value="1" defaultChecked={defaults.intro} className="mt-0.5 size-4 accent-ink" />
              <span>
                <span className="font-medium">{t("requests.form.intro")}</span>
                <span className="block text-xs text-smoke">{t("requests.form.introHint")}</span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t("requests.form.cap")} htmlFor="capId" optional error={err("capId")}>
          <NativeSelect id="capId" name="capId" defaultValue={defaults.capId ?? ""}>
            <option value="">{t("requests.form.capNone")}</option>
            {caps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("requests.form.activity")} htmlFor="activity" optional error={err("activity")}>
          <Input id="activity" name="activity" maxLength={200} defaultValue={defaults.activity ?? ""} placeholder={t("requests.form.activityPlaceholder")} />
        </Field>
        <Field label={t("requests.form.preferredDate")} htmlFor="preferredDate" optional error={err("preferredDate")}>
          <Input id="preferredDate" name="preferredDate" type="date" defaultValue={defaults.preferredDate ?? ""} aria-invalid={errors.preferredDate ? true : undefined} />
        </Field>
        <Field label={t("requests.form.timeframe")} htmlFor="timeframe" optional error={err("timeframe")}>
          <Input id="timeframe" name="timeframe" maxLength={200} defaultValue={defaults.timeframe ?? ""} placeholder={t("requests.form.timeframePlaceholder")} />
        </Field>
        <Field label={t("requests.form.participants")} htmlFor="participantCount" optional error={err("participantCount")}>
          <Input
            id="participantCount"
            name="participantCount"
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            defaultValue={defaults.participantCount ?? ""}
            aria-invalid={errors.participantCount ? true : undefined}
            className="max-w-32"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" variant={brand ? "brand" : "default"} disabled={busy}>
          {busy ? pendingLabel : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link to={cancelTo}>{t("requests.form.cancel")}</Link>
        </Button>
      </div>
    </Form>
  );
}

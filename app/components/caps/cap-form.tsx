/**
 * The CAP form, for both "New CAP" and edit mode. Suggested topics are real
 * checkboxes styled as pills (so it works without JavaScript and with a
 * keyboard); anything else goes in the "Other topics" text box.
 */
import { Form, Link, useNavigation } from "react-router";
import { Check, Loader2 } from "lucide-react";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { useT } from "~/i18n";
import { BLOCK_DAYS, CAP_BLOCKS, CAP_LABELS, type CapBlock, type CapLabel } from "~/lib/cap-catalog";
import { CAP_STATUSES, SUGGESTED_CAP_TOPICS, type CapStatus } from "~/lib/constants";
import type { CapFormErrorKey, CapFormField } from "~/lib/caps.server";
import { useTopicLabel } from "./cap-bits";

export type CapFormDefaults = {
  title?: string;
  driving_question?: string | null;
  description?: string | null;
  topics?: string[];
  needs?: string | null;
  term?: string | null;
  status?: CapStatus;
  teacher?: string | null;
  blocks?: CapBlock[];
  labels?: CapLabel[];
  impact?: string | null;
};

const SUGGESTED = new Set<string>(SUGGESTED_CAP_TOPICS);
const pill =
  "group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone bg-canvas px-3 py-1.5 text-sm text-graphite transition-colors select-none hover:border-gold has-checked:border-gold has-checked:bg-gold-soft has-checked:text-ink has-focus-visible:ring-3 has-focus-visible:ring-ring/50";

export function CapForm({
  defaults = {},
  errors,
  intent,
  submitLabel,
  pendingLabel,
  cancelTo,
}: {
  defaults?: CapFormDefaults;
  errors?: Partial<Record<CapFormField, CapFormErrorKey>>;
  intent?: string;
  submitLabel: string;
  pendingLabel: string;
  cancelTo: string;
}) {
  const { t } = useT();
  const topicLabel = useTopicLabel();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting" && (!intent || navigation.formData?.get("intent") === intent);
  const chosen = new Set(defaults.topics ?? []);
  const other = (defaults.topics ?? []).filter((topic) => !SUGGESTED.has(topic)).join(", ");
  const err = (field: CapFormField) => (errors?.[field] ? t(errors[field]!) : undefined);
  const hasErrors = !!errors && Object.keys(errors).length > 0;

  return (
    <Form method="post" className="grid gap-6">
      {intent && <input type="hidden" name="intent" value={intent} />}
      {hasErrors && (
        <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
          {t("caps.form.error.summary")}
        </p>
      )}

      <Field label={t("caps.form.title")} htmlFor="cap-title" error={err("title")}>
        <Input
          id="cap-title"
          name="title"
          required
          maxLength={160}
          defaultValue={defaults.title}
          placeholder={t("caps.form.titlePlaceholder")}
          aria-invalid={!!errors?.title || undefined}
          className="h-11"
        />
      </Field>

      <Field label={t("caps.form.drivingQuestion")} htmlFor="cap-question" optional error={err("driving_question")}>
        <Textarea
          id="cap-question"
          name="driving_question"
          maxLength={400}
          rows={2}
          defaultValue={defaults.driving_question ?? ""}
          placeholder={t("caps.form.drivingQuestionPlaceholder")}
          aria-invalid={!!errors?.driving_question || undefined}
          className="bg-canvas"
        />
      </Field>

      <Field label={t("caps.form.description")} htmlFor="cap-description" optional error={err("description")}>
        <Textarea
          id="cap-description"
          name="description"
          maxLength={4000}
          rows={4}
          defaultValue={defaults.description ?? ""}
          placeholder={t("caps.form.descriptionPlaceholder")}
          aria-invalid={!!errors?.description || undefined}
          className="bg-canvas"
        />
      </Field>

      <fieldset className="grid gap-3" aria-describedby="cap-topics-hint">
        <legend className="mb-1.5 text-sm font-medium text-graphite">
          {t("caps.form.topics")} <span className="font-normal text-smoke">({t("common.state.optional")})</span>
        </legend>
        <p id="cap-topics-hint" className="-mt-1 text-xs text-smoke">
          {t("caps.form.topicsHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_CAP_TOPICS.map((topic) => (
            <label
              key={topic}
              className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone bg-canvas px-3 py-1.5 text-sm text-graphite transition-colors select-none hover:border-gold has-checked:border-gold has-checked:bg-gold-soft has-checked:text-ink has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input type="checkbox" name="topics" value={topic} defaultChecked={chosen.has(topic)} className="peer sr-only" />
              <Check className="hidden size-3.5 peer-checked:block" aria-hidden="true" />
              {topicLabel(topic)}
            </label>
          ))}
        </div>
        <Field label={t("caps.form.topicsOther")} htmlFor="cap-topics-other" hint={t("caps.form.topicsOtherHint")} error={err("topics")}>
          <Input
            id="cap-topics-other"
            name="topics_other"
            maxLength={600}
            defaultValue={other}
            placeholder={t("caps.form.topicsPlaceholder")}
            aria-invalid={!!errors?.topics || undefined}
          />
        </Field>
      </fieldset>

      <Field label={t("caps.form.needs")} htmlFor="cap-needs" optional hint={t("caps.form.needsHint")} error={err("needs")}>
        <Textarea
          id="cap-needs"
          name="needs"
          maxLength={1000}
          rows={3}
          defaultValue={defaults.needs ?? ""}
          placeholder={t("caps.form.needsPlaceholder")}
          aria-invalid={!!errors?.needs || undefined}
          className="bg-canvas"
        />
      </Field>

      <Field label={t("caps.form.impact")} htmlFor="cap-impact" optional error={err("impact")}>
        <Textarea
          id="cap-impact"
          name="impact"
          maxLength={1000}
          rows={2}
          defaultValue={defaults.impact ?? ""}
          placeholder={t("caps.form.impactPlaceholder")}
          aria-invalid={!!errors?.impact || undefined}
          className="bg-canvas"
        />
      </Field>

      <Field label={t("caps.form.teacher")} htmlFor="cap-teacher" optional error={err("teacher")}>
        <Input id="cap-teacher" name="teacher" maxLength={120} defaultValue={defaults.teacher ?? ""} aria-invalid={!!errors?.teacher || undefined} />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-graphite">{t("caps.form.blocks")}</legend>
        <p className="-mt-0.5 text-xs text-smoke">{t("caps.form.blocksHint")}</p>
        <div className="flex flex-wrap gap-2">
          {CAP_BLOCKS.map((block) => (
            <label key={block} className={pill}>
              <input type="checkbox" name="blocks" value={block} defaultChecked={defaults.blocks?.includes(block)} className="peer sr-only" />
              <Check className="hidden size-3.5 peer-checked:block" aria-hidden="true" />
              {t("caps.block.name", { block })} · {t(`caps.days.${BLOCK_DAYS[block]}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-graphite">
          {t("caps.form.labels")} <span className="font-normal text-smoke">({t("common.state.optional")})</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {CAP_LABELS.map((label) => (
            <label key={label} className={pill}>
              <input type="checkbox" name="labels" value={label} defaultChecked={defaults.labels?.includes(label)} className="peer sr-only" />
              <Check className="hidden size-3.5 peer-checked:block" aria-hidden="true" />
              {t(`caps.label.${label}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("caps.form.term")} htmlFor="cap-term" optional error={err("term")}>
          <Input
            id="cap-term"
            name="term"
            maxLength={60}
            defaultValue={defaults.term ?? ""}
            placeholder={t("caps.form.termPlaceholder")}
            aria-invalid={!!errors?.term || undefined}
          />
        </Field>
        <Field label={t("caps.form.status")} htmlFor="cap-status">
          <Select name="status" defaultValue={defaults.status ?? "planning"}>
            <SelectTrigger id="cap-status" className="h-10 w-full bg-canvas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAP_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`common.capStatus.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-stone pt-5">
        <Button type="submit" variant="brand" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? pendingLabel : submitLabel}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to={cancelTo}>{t("common.action.cancel")}</Link>
        </Button>
      </div>
    </Form>
  );
}

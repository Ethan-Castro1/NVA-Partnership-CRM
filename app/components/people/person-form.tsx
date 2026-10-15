/**
 * The one add/edit person form (admins only). Field names match
 * parsePersonForm in app/lib/people-form.server.ts; errors arrive as i18n
 * keys from the route action and are translated here.
 */
import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { Plus } from "lucide-react";
import { Field, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useT } from "~/i18n";
import {
  AFFILIATIONS,
  CONTRIBUTION_COLOR,
  CONTRIBUTION_TYPES,
  LANGUAGES,
  ORGANIZATION_KINDS,
  PERSON_STATUSES,
  SUGGESTED_CAP_TOPICS,
  normalizeTags,
  type Affiliation,
  type ContributionType,
  type OrganizationKind,
  type PersonStatus,
  type PreferredLanguage,
} from "~/lib/constants";
import type { PersonFormErrors } from "~/lib/people-form.server";
import { cn } from "~/lib/utils";
import { useTopicLabel } from "~/components/caps/cap-bits";
import { NamedSelect } from "./named-select";

export type PersonFormValues = {
  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_language: PreferredLanguage;
  organization_name: string | null;
  organization_kind: OrganizationKind | null;
  title: string | null;
  contribution_types: ContributionType[];
  affiliations: Affiliation[];
  skills: string[];
  cap_topics: string[];
  availability: string | null;
  bio: string | null;
  status: PersonStatus;
  notes: string | null;
  funding_focus: string | null;
};

export const EMPTY_PERSON: PersonFormValues = {
  full_name: "",
  email: null,
  phone: null,
  preferred_language: "en",
  organization_name: null,
  organization_kind: null,
  title: null,
  contribution_types: [],
  affiliations: [],
  skills: [],
  cap_topics: [],
  availability: null,
  bio: null,
  status: "new",
  notes: null,
  funding_focus: null,
};

const checkCard =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-stone bg-canvas p-3.5 transition-colors hover:border-graphite/40 has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:bg-gold-soft/60";

export function PersonForm({
  defaults = EMPTY_PERSON,
  errors = {},
  duplicateId,
  submitLabel,
  cancelTo,
}: {
  defaults?: PersonFormValues;
  errors?: PersonFormErrors;
  duplicateId?: string | null;
  submitLabel: string;
  cancelTo: string;
}) {
  const { t } = useT();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const [topics, setTopics] = useState(defaults.cap_topics.join(", "));
  const topicLabel = useTopicLabel();
  // Each detail field shows when it fits a chosen way to help, or already has something in it.
  const [types, setTypes] = useState<ContributionType[]>(defaults.contribution_types);
  const picked = (...wanted: ContributionType[]) => wanted.some((type) => types.includes(type));
  const showSkills = picked("skills_lesson", "classroom_volunteer", "after_school", "internship") || defaults.skills.length > 0;
  const showTopics = picked("cap_partner") || defaults.cap_topics.length > 0;
  const showFunding = picked("funder") || !!defaults.funding_focus;
  const showAvailability =
    picked("skills_lesson", "classroom_volunteer", "after_school", "internship") || !!defaults.availability;
  const current = normalizeTags(topics);
  const suggestions = SUGGESTED_CAP_TOPICS.filter((topic) => !current.includes(topic));
  const err = (field: keyof PersonFormErrors) => (errors[field] ? t(errors[field]!) : undefined);
  const invalid = (field: keyof PersonFormErrors) => (errors[field] ? true : undefined);
  const hasErrors = Object.keys(errors).length > 0 || !!duplicateId;

  return (
    <Form method="post" className="grid gap-6" noValidate>
      {hasErrors && (
        <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
          {t("people.form.errorSummary")}
        </p>
      )}

      <Panel title={t("people.form.sectionBasics")} bodyClassName="grid gap-4 md:grid-cols-2">
        <Field label={t("common.field.name")} htmlFor="pf-name" error={err("full_name")} className="md:col-span-2">
          <Input
            id="pf-name"
            name="full_name"
            required
            maxLength={200}
            autoComplete="off"
            defaultValue={defaults.full_name}
            aria-invalid={invalid("full_name")}
          />
        </Field>
        <Field
          label={t("common.field.email")}
          htmlFor="pf-email"
          optional
          error={
            duplicateId ? (
              <>
                {t("people.form.duplicateEmail")}{" "}
                <Link to={`/app/people/${duplicateId}`} className="underline underline-offset-4">
                  {t("people.form.duplicateLink")}
                </Link>
              </>
            ) : (
              err("email")
            )
          }
        >
          <Input
            id="pf-email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="off"
            defaultValue={defaults.email ?? ""}
            aria-invalid={invalid("email") ?? (duplicateId ? true : undefined)}
          />
        </Field>
        <Field label={t("common.field.phone")} htmlFor="pf-phone" optional error={err("phone")}>
          <Input id="pf-phone" name="phone" type="tel" maxLength={40} autoComplete="off" defaultValue={defaults.phone ?? ""} aria-invalid={invalid("phone")} />
        </Field>
        <Field label={t("common.field.language")} htmlFor="pf-language">
          <NamedSelect
            id="pf-language"
            name="preferred_language"
            defaultValue={defaults.preferred_language}
            options={LANGUAGES.map((l) => ({ value: l, label: t(`common.language.${l}`) }))}
          />
        </Field>
        <Field label={t("common.field.title")} htmlFor="pf-title" optional error={err("title")}>
          <Input id="pf-title" name="title" maxLength={200} defaultValue={defaults.title ?? ""} aria-invalid={invalid("title")} />
        </Field>
        <Field label={t("common.field.organization")} htmlFor="pf-org" optional error={err("organization_name")}>
          <Input
            id="pf-org"
            name="organization_name"
            maxLength={200}
            defaultValue={defaults.organization_name ?? ""}
            aria-invalid={invalid("organization_name")}
          />
        </Field>
        <Field label={t("people.form.orgKind")} htmlFor="pf-org-kind">
          <NamedSelect
            id="pf-org-kind"
            name="organization_kind"
            defaultValue={defaults.organization_kind ?? "other"}
            options={ORGANIZATION_KINDS.map((k) => ({ value: k, label: t(`common.orgKind.${k}`) }))}
          />
        </Field>
      </Panel>

      <Panel title={t("people.form.sectionContribute")} bodyClassName="grid gap-6">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-graphite">{t("common.field.contributions")}</legend>
          <p className="mb-1 text-xs text-smoke">{t("people.form.contributionsHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTRIBUTION_TYPES.map((type) => (
              <label key={type} htmlFor={`pf-ct-${type}`} className={checkCard}>
                <Checkbox
                  id={`pf-ct-${type}`}
                  name="contribution_types"
                  value={type}
                  defaultChecked={defaults.contribution_types.includes(type)}
                  onCheckedChange={(on) =>
                    setTypes((prev) => (on === true ? [...new Set([...prev, type])] : prev.filter((t) => t !== type)))
                  }
                  className="mt-0.5 bg-canvas"
                />
                <span className="grid gap-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span className={cn("size-2.5 rounded-full", CONTRIBUTION_COLOR[type].dot)} aria-hidden="true" />
                    {t(`common.contributionLong.${type}`)}
                  </span>
                  <span className="text-xs leading-relaxed text-smoke">{t(`common.contributionHelp.${type}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-graphite">{t("common.field.affiliations")}</legend>
          <p className="mb-1 text-xs text-smoke">{t("people.form.affiliationsHint")}</p>
          <div className="flex flex-wrap gap-2">
            {AFFILIATIONS.map((a) => (
              <label
                key={a}
                htmlFor={`pf-aff-${a}`}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-stone bg-canvas py-2 pr-3.5 pl-3 text-sm text-graphite has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:text-ink"
              >
                <Checkbox id={`pf-aff-${a}`} name="affiliations" value={a} defaultChecked={defaults.affiliations.includes(a)} />
                {t(`common.affiliation.${a}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel title={t("people.form.sectionSkills")} bodyClassName="grid gap-4">
        {showFunding && (
          <Field
            label={t("common.field.fundingFocus")}
            htmlFor="pf-funding"
            optional
            hint={t("people.form.fundingHint")}
            error={err("funding_focus")}
          >
            <Textarea
              id="pf-funding"
              name="funding_focus"
              rows={3}
              maxLength={2000}
              placeholder={t("people.form.fundingPlaceholder")}
              defaultValue={defaults.funding_focus ?? ""}
              aria-invalid={invalid("funding_focus")}
              className="bg-canvas"
            />
          </Field>
        )}
        {showSkills ? (
          <Field label={t("common.field.skills")} htmlFor="pf-skills" optional hint={t("people.form.skillsHint")} error={err("skills")}>
            <Input id="pf-skills" name="skills" maxLength={2000} defaultValue={defaults.skills.join(", ")} aria-invalid={invalid("skills")} />
          </Field>
        ) : (
          <input type="hidden" name="skills" value={defaults.skills.join(", ")} />
        )}
        {showTopics ? (
        <>
        <Field label={t("common.field.capTopics")} htmlFor="pf-topics" optional hint={t("people.form.capTopicsHint")} error={err("cap_topics")}>
          <Input
            id="pf-topics"
            name="cap_topics"
            maxLength={2000}
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            aria-invalid={invalid("cap_topics")}
          />
        </Field>
        {suggestions.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs text-smoke" id="pf-topic-suggestions">
              {t("people.form.suggestions")}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-labelledby="pf-topic-suggestions">
              {suggestions.map((topic) => (
                <li key={topic}>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-label={t("people.form.addTopic", { topic: topicLabel(topic) })}
                    onClick={() => setTopics([...current, topic].join(", "))}
                  >
                    <Plus aria-hidden="true" />
                    {topicLabel(topic)}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        </>
        ) : (
          <input type="hidden" name="cap_topics" value={topics} />
        )}
        {showAvailability ? (
          <Field label={t("common.field.availability")} htmlFor="pf-availability" optional error={err("availability")}>
            <Input
              id="pf-availability"
              name="availability"
              maxLength={500}
              placeholder={t("people.form.availabilityPlaceholder")}
              defaultValue={defaults.availability ?? ""}
              aria-invalid={invalid("availability")}
            />
          </Field>
        ) : (
          <input type="hidden" name="availability" value={defaults.availability ?? ""} />
        )}
        <Field label={t("common.field.bio")} htmlFor="pf-bio" optional error={err("bio")}>
          <Textarea
            id="pf-bio"
            name="bio"
            rows={4}
            maxLength={4000}
            placeholder={t("people.form.bioPlaceholder")}
            defaultValue={defaults.bio ?? ""}
            aria-invalid={invalid("bio")}
            className="bg-canvas"
          />
        </Field>
      </Panel>

      <Panel title={t("people.form.sectionStatus")} bodyClassName="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <Field
          label={t("common.field.status")}
          htmlFor="pf-status"
          hint={PERSON_STATUSES.map((s) => `${t(`common.status.${s}`)}: ${t(`common.statusHelp.${s}`)}`).join(" ")}
        >
          <NamedSelect
            id="pf-status"
            name="status"
            defaultValue={defaults.status}
            options={PERSON_STATUSES.map((s) => ({ value: s, label: t(`common.status.${s}`) }))}
          />
        </Field>
        <Field label={t("common.field.notes")} htmlFor="pf-notes" optional hint={t("people.form.notesHint")} error={err("notes")}>
          <Textarea
            id="pf-notes"
            name="notes"
            rows={4}
            maxLength={4000}
            defaultValue={defaults.notes ?? ""}
            aria-invalid={invalid("notes")}
            className="bg-canvas"
          />
        </Field>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="brand" size="lg" disabled={busy}>
          {busy ? t("common.state.saving") : submitLabel}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to={cancelTo}>{t("common.action.cancel")}</Link>
        </Button>
      </div>
    </Form>
  );
}

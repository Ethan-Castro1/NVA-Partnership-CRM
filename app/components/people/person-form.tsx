/**
 * The full add/edit person form (admins only). Field names match
 * parsePersonForm in app/lib/people-form.server.ts; errors arrive as i18n
 * keys from the route action and are translated here. When the action finds
 * likely duplicates it passes them back, and the form lists them with a
 * "Save anyway" button (which posts confirm_duplicates=1).
 */
import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { AlertTriangle, Plus } from "lucide-react";
import { Field, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useT } from "~/i18n";
import {
  AFFILIATIONS,
  CONTACT_CATEGORIES,
  CONTACT_MODES,
  CONTRIBUTION_COLOR,
  CONTRIBUTION_TYPES,
  LANGUAGES,
  ORGANIZATION_KINDS,
  PERSON_STATUSES,
  SUGGESTED_CAP_TOPICS,
  normalizeTags,
  type Affiliation,
  type ContactCategory,
  type ContactMode,
  type ContributionType,
  type OrganizationKind,
  type PersonStatus,
  type PreferredLanguage,
} from "~/lib/constants";
import type { DuplicateCandidate } from "~/lib/duplicates.server";
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
  categories: ContactCategory[];
  origin: string | null;
  owner_user_id: string | null;
  shared_summary: string | null;
  location: string | null;
  directory_visible: boolean;
  contact_mode: ContactMode;
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
  categories: [],
  origin: null,
  owner_user_id: null,
  shared_summary: null,
  location: null,
  directory_visible: false,
  contact_mode: "introduction",
};

const checkCard =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-stone bg-canvas p-3.5 transition-colors hover:border-graphite/40 has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:bg-gold-soft/60";

export type PersonFormDuplicate = Pick<
  DuplicateCandidate,
  "id" | "full_name" | "email" | "organization_name" | "directory_visible" | "reasons"
>;

/** Likely duplicates found when the name or email changed, with a way to save anyway. */
function DuplicateWarning({ duplicates, busy }: { duplicates: PersonFormDuplicate[]; busy: boolean }) {
  const { t } = useT();
  return (
    <section role="alert" aria-labelledby="pf-dup-title" className="grid gap-3 rounded-card border border-gold bg-gold-soft/50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden="true" />
        <div className="grid gap-0.5">
          <h2 id="pf-dup-title" className="text-sm font-medium text-ink">
            {t("people.form.dupTitle")}
          </h2>
          <p className="text-sm text-graphite">{t("people.form.dupBody")}</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {duplicates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
            <span className="grid min-w-0">
              <Link to={`/app/people/${d.id}`} className="font-medium text-ink underline decoration-stone underline-offset-4 hover:decoration-gold">
                {d.full_name}
              </Link>
              <span className="text-xs break-all text-smoke">{[d.organization_name, d.email].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="flex flex-wrap gap-1">
              {d.reasons.map((r) => (
                <span key={r} className="inline-flex h-5 items-center rounded-full bg-stone px-2 text-[0.7rem] text-graphite">
                  {t(`people.form.dupReason.${r}`)}
                </span>
              ))}
              {!d.directory_visible && (
                <span className="inline-flex h-5 items-center rounded-full border border-stone px-2 text-[0.7rem] text-smoke">
                  {t("people.form.dupHidden")}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Button type="submit" name="confirm_duplicates" value="1" variant="outline" size="sm" className="w-fit" disabled={busy}>
        {t("people.form.dupSaveAnyway")}
      </Button>
    </section>
  );
}

export function PersonForm({
  defaults = EMPTY_PERSON,
  errors = {},
  duplicateId,
  duplicates = [],
  owners = [],
  submitLabel,
  cancelTo,
}: {
  defaults?: PersonFormValues;
  errors?: PersonFormErrors;
  /** Another record already has this exact email (saving is blocked). */
  duplicateId?: string | null;
  /** Likely duplicates to confirm before saving. */
  duplicates?: PersonFormDuplicate[];
  /** Admins who can own the relationship. */
  owners?: { id: string; name: string }[];
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
  const [contactMode, setContactMode] = useState<ContactMode>(defaults.contact_mode);

  return (
    <Form method="post" className="grid gap-6" noValidate>
      {hasErrors && (
        <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
          {t("people.form.errorSummary")}
        </p>
      )}
      {duplicates.length > 0 && <DuplicateWarning duplicates={duplicates} busy={busy} />}

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
        <Field label={t("common.field.location")} htmlFor="pf-location" optional error={err("location")}>
          <Input
            id="pf-location"
            name="location"
            maxLength={200}
            placeholder={t("people.form.locationPlaceholder")}
            defaultValue={defaults.location ?? ""}
            aria-invalid={invalid("location")}
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

      <Panel title={t("people.form.sectionCrm")} bodyClassName="grid gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-graphite">{t("common.field.categories")}</legend>
          <p className="mb-1 text-xs text-smoke">{t("people.form.categoriesHint")}</p>
          <div className="flex flex-wrap gap-2">
            {CONTACT_CATEGORIES.map((c) => (
              <label
                key={c}
                htmlFor={`pf-cat-${c}`}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-stone bg-canvas py-2 pr-3.5 pl-3 text-sm text-graphite has-[[data-state=checked]]:border-ink has-[[data-state=checked]]:text-ink"
              >
                <Checkbox id={`pf-cat-${c}`} name="categories" value={c} defaultChecked={defaults.categories.includes(c)} />
                {t(`common.category.${c}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("common.field.owner")} htmlFor="pf-owner" error={err("owner_user_id")}>
            <NamedSelect
              id="pf-owner"
              name="owner_user_id"
              defaultValue={defaults.owner_user_id ?? "none"}
              invalid={invalid("owner_user_id")}
              options={[{ value: "none", label: t("people.form.ownerNone") }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
            />
          </Field>
          <Field label={t("common.field.origin")} htmlFor="pf-origin" optional error={err("origin")} className="md:col-span-2">
            <Textarea
              id="pf-origin"
              name="origin"
              rows={2}
              maxLength={2000}
              placeholder={t("people.form.originPlaceholder")}
              defaultValue={defaults.origin ?? ""}
              aria-invalid={invalid("origin")}
              className="bg-canvas"
            />
          </Field>
        </div>
        <div className="grid gap-4 rounded-xl border border-stone bg-canvas p-4 md:grid-cols-2">
          <label htmlFor="pf-visible" className="flex cursor-pointer items-start gap-3">
            <Checkbox id="pf-visible" name="directory_visible" value="on" defaultChecked={defaults.directory_visible} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium text-ink">{t("common.field.directoryVisible")}</span>
              <span className="text-xs text-smoke">{t("people.form.directoryVisibleHint")}</span>
            </span>
          </label>
          <div className="grid gap-1.5">
            <label htmlFor="pf-contact-mode" className="text-sm font-medium text-graphite">
              {t("common.field.contactMode")}
            </label>
            <select
              id="pf-contact-mode"
              name="contact_mode"
              value={contactMode}
              onChange={(e) => setContactMode(e.target.value as ContactMode)}
              aria-describedby="pf-contact-mode-help"
              className="h-10 w-full rounded-lg border border-input bg-canvas px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {CONTACT_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`common.contactMode.${m}`)}
                </option>
              ))}
            </select>
            <p id="pf-contact-mode-help" className="text-xs text-smoke">
              {t(`common.contactModeHelp.${contactMode}`)}
            </p>
          </div>
        </div>
        <Field
          label={t("common.field.sharedSummary")}
          htmlFor="pf-summary"
          optional
          hint={t("people.form.sharedSummaryHint")}
          error={err("shared_summary")}
        >
          <Textarea
            id="pf-summary"
            name="shared_summary"
            rows={3}
            maxLength={2000}
            defaultValue={defaults.shared_summary ?? ""}
            aria-invalid={invalid("shared_summary")}
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

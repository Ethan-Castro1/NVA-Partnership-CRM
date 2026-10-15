import { useEffect, useRef } from "react";
import { Form, data, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/join";
import {
  CheckRow,
  ContributionCard,
  FILLED,
  FILLED_AREA,
  FormSection,
  PillCheckbox,
  RadioPills,
  ReferralRows,
  Req,
} from "~/components/intake/form-parts";
import { REFERRAL_SLOTS, type IntakeErrors, type IntakeFormValues } from "~/components/intake/form-types";
import { PublicTopBar, SkipLink } from "~/components/intake/public-shell";
import { Field, VillageMark } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { makeT, useT, type Locale } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { clientIp } from "~/lib/auth.server";
import { CONTRIBUTION_TYPES, LANGUAGES, SUGGESTED_CAP_TOPICS } from "~/lib/constants";
import {
  HONEYPOT_FIELD,
  PUBLIC_AFFILIATIONS,
  isHoneypotFilled,
  isIntakeRateLimited,
  processIntake,
  readIntakeForm,
  recordIntakeAttempt,
  validateIntake,
} from "~/lib/intake.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: Locale } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [
    { title: `${t("intake.title")} | ${t("common.schoolName")}` },
    { name: "description", content: t("intake.subtitle") },
  ];
};

type ActionResult = { errors: IntakeErrors; values: IntakeFormValues };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const requested = form.get("locale");
  const locale: Locale = requested === "es" || requested === "en" ? requested : await getLocale(request);
  const ip = clientIp(request);

  // Bots that fill the hidden field get the same thank-you page and nothing is saved.
  if (isHoneypotFilled(form)) {
    recordIntakeAttempt(ip);
    throw redirect("/join/thanks");
  }

  const values = readIntakeForm(form);
  if (isIntakeRateLimited(ip)) {
    return data<ActionResult>({ errors: { _form: "intake.error.rateLimited" }, values }, { status: 429 });
  }

  const result = validateIntake(values, locale);
  if (!result.ok) return data<ActionResult>({ errors: result.errors, values }, { status: 400 });

  recordIntakeAttempt(ip);
  try {
    await processIntake(result.payload, locale);
  } catch (error) {
    // Log the failure kind only: the payload is personal data.
    console.error("intake: could not save a sign-up", error instanceof Error ? error.name : "unknown");
    return data<ActionResult>({ errors: { _form: "intake.error.generic" }, values }, { status: 500 });
  }
  throw redirect("/join/thanks");
}

const EMPTY_ROWS = Array.from({ length: REFERRAL_SLOTS }, () => ({ name: "", contact: "", how_known: "", can_help_with: "" }));

export default function Join() {
  const { t, locale } = useT();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  const summaryRef = useRef<HTMLDivElement>(null);

  const errors: IntakeErrors = actionData?.errors ?? {};
  const v = actionData?.values;
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const hasErrors = Object.keys(errors).length > 0;

  // After a failed submit, move focus to the summary so screen readers and keyboards land on it.
  useEffect(() => {
    if (actionData?.errors && Object.keys(actionData.errors).length) summaryRef.current?.focus();
  }, [actionData]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#fff3d1_0%,#fdfcfc_60%)]">
      <SkipLink />
      <PublicTopBar />
      <main id="main" className="px-4 pt-2 pb-16 md:pt-6">
        <div className="mx-auto w-full max-w-2xl rounded-[24px] bg-canvas p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)] ring-1 ring-stone sm:p-8 md:p-10">
          <VillageMark className="mx-auto mb-5 size-11" />
          <h1 className="text-center font-display text-3xl font-bold tracking-tight md:text-4xl">{t("intake.title")}</h1>
          <p className="mx-auto mt-3 max-w-lg text-center text-smoke">{t("intake.subtitle")}</p>
          <p className="mt-2 text-center text-xs text-smoke">{t("intake.requiredNote")}</p>

          {hasErrors && (
            <div
              ref={summaryRef}
              tabIndex={-1}
              role="alert"
              className="mt-6 rounded-xl bg-rust-soft px-4 py-3 text-sm text-rust-ink focus:outline-none"
            >
              {errors._form ? t(errors._form) : t("intake.error.summary")}
            </div>
          )}

          <Form method="post" noValidate className="mt-8 grid gap-8">
            <input type="hidden" name="locale" value={locale} />

            {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label htmlFor={HONEYPOT_FIELD}>{t("intake.honeypot")}</label>
              <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>

            {/* a. About you */}
            <FormSection legend={t("intake.section.about")} className="border-t-0 pt-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={<Req>{t("common.field.name")}</Req>} htmlFor="full_name" error={err("full_name")} className="sm:col-span-2">
                  <Input
                    id="full_name"
                    name="full_name"
                    autoComplete="name"
                    required
                    maxLength={120}
                    defaultValue={v?.full_name}
                    aria-invalid={!!errors.full_name || undefined}
                    className={FILLED}
                  />
                </Field>
                <Field label={<Req>{t("common.field.email")}</Req>} htmlFor="email" error={err("email")}>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={200}
                    defaultValue={v?.email}
                    aria-invalid={!!errors.email || undefined}
                    className={FILLED}
                  />
                </Field>
                <Field label={t("common.field.phone")} htmlFor="phone" optional error={err("phone")}>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    defaultValue={v?.phone}
                    aria-invalid={!!errors.phone || undefined}
                    className={FILLED}
                  />
                </Field>
                <Field label={t("common.field.organization")} htmlFor="organization" optional error={err("organization")}>
                  <Input
                    id="organization"
                    name="organization"
                    autoComplete="organization"
                    maxLength={160}
                    defaultValue={v?.organization}
                    className={FILLED}
                  />
                </Field>
                <Field label={t("common.field.title")} htmlFor="title" optional error={err("title")}>
                  <Input
                    id="title"
                    name="title"
                    autoComplete="organization-title"
                    maxLength={120}
                    defaultValue={v?.title}
                    className={FILLED}
                  />
                </Field>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-sm font-medium text-graphite">{t("common.field.language")}</legend>
                <RadioPills
                  name="preferred_language"
                  defaultValue={v?.preferred_language || locale}
                  options={LANGUAGES.map((lang) => ({ value: lang, label: t(`common.language.${lang}`) }))}
                />
              </fieldset>
            </FormSection>

            {/* b. How would you like to help? */}
            <FormSection
              legend={<Req>{t("intake.section.help")}</Req>}
              hint={t("intake.section.helpHint")}
              error={err("contribution_types")}
              errorId="contribution-error"
            >
              <div className="grid gap-3">
                {CONTRIBUTION_TYPES.map((type) => (
                  <ContributionCard key={type} type={type} defaultChecked={!!v?.contribution_types.includes(type)} />
                ))}
              </div>
            </FormSection>

            {/* c. What can you share? */}
            <FormSection legend={t("intake.section.share")}>
              <Field label={t("intake.skillsLabel")} htmlFor="skills" hint={t("intake.skillsHint")} error={err("skills")}>
                <Input id="skills" name="skills" maxLength={500} defaultValue={v?.skills} className={FILLED} />
              </Field>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium text-graphite">{t("intake.topicsLabel")}</legend>
                <p className="text-xs text-smoke">{t("intake.topicsHint")}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {SUGGESTED_CAP_TOPICS.map((topic) => (
                    <PillCheckbox
                      key={topic}
                      name="cap_topics"
                      value={topic}
                      label={t(`intake.topic.${topic}`)}
                      defaultChecked={!!v?.cap_topics.includes(topic)}
                    />
                  ))}
                </div>
              </fieldset>
              <Field
                label={t("intake.topicsOther")}
                htmlFor="cap_topics_other"
                optional
                hint={t("intake.topicsOtherHint")}
                error={err("cap_topics_other")}
              >
                <Input id="cap_topics_other" name="cap_topics_other" maxLength={300} defaultValue={v?.cap_topics_other} className={FILLED} />
              </Field>
              <Field label={t("intake.availabilityLabel")} htmlFor="availability" optional error={err("availability")}>
                <Textarea
                  id="availability"
                  name="availability"
                  rows={2}
                  maxLength={500}
                  placeholder={t("intake.availabilityPlaceholder")}
                  defaultValue={v?.availability}
                  className={FILLED_AREA}
                />
              </Field>
              <Field label={t("intake.bioLabel")} htmlFor="bio" optional error={err("bio")}>
                <Textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  maxLength={2000}
                  placeholder={t("intake.bioPlaceholder")}
                  defaultValue={v?.bio}
                  className={FILLED_AREA}
                />
              </Field>
            </FormSection>

            {/* d. Connection to NVA (never board or staff on the public form). */}
            <FormSection legend={t("intake.section.connection")} hint={t("intake.section.connectionHint")}>
              <div className="grid gap-1">
                {PUBLIC_AFFILIATIONS.map((affiliation) => (
                  <CheckRow
                    key={affiliation}
                    name="affiliations"
                    value={affiliation}
                    label={t(`common.affiliation.${affiliation}`)}
                    defaultChecked={!!v?.affiliations.includes(affiliation)}
                  />
                ))}
              </div>
            </FormSection>

            {/* e. Who told you about NVA, and who else could help. */}
            <FormSection legend={t("intake.section.referredBy")} hint={t("intake.section.referredByHint")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("intake.referredByName")} htmlFor="referred_by_name" optional error={err("referred_by_name")}>
                  <Input
                    id="referred_by_name"
                    name="referred_by_name"
                    maxLength={120}
                    autoComplete="off"
                    defaultValue={v?.referred_by_name}
                    aria-invalid={!!errors.referred_by_name || undefined}
                    className={FILLED}
                  />
                </Field>
                <Field label={t("intake.referredByEmail")} htmlFor="referred_by_email" optional error={err("referred_by_email")}>
                  <Input
                    id="referred_by_email"
                    name="referred_by_email"
                    type="email"
                    maxLength={200}
                    autoComplete="off"
                    defaultValue={v?.referred_by_email}
                    aria-invalid={!!errors.referred_by_email || undefined}
                    className={FILLED}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection legend={t("intake.section.referrals")} hint={t("intake.section.referralsHint")}>
              <ReferralRows rows={v?.referrals ?? EMPTY_ROWS} errors={errors} />
            </FormSection>

            {/* f. Consent */}
            <FormSection legend={<Req>{t("intake.section.consent")}</Req>} error={err("consent")} errorId="consent-error">
              <CheckRow
                name="consent"
                label={t("intake.consent")}
                defaultChecked={!!v?.consent}
                required
                invalid={!!errors.consent}
                describedBy={errors.consent ? "consent-error" : undefined}
              />
            </FormSection>

            <Button type="submit" variant="brand" size="lg" className="w-full" disabled={busy}>
              {busy ? t("intake.submitting") : t("intake.submit")}
            </Button>
          </Form>
        </div>
      </main>
    </div>
  );
}

/**
 * Quick add (admins only): name, organization, email or phone and short
 * notes; everything else behind "More details"; an optional follow-up. This
 * is where admins add CAP partners, internship hosts and funders who never
 * used the public form. A likely duplicate stops the first save: the admin
 * opens the existing record or chooses "Save anyway".
 */
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type { Route } from "./+types/app.people.new";
import { NamedSelect } from "~/components/people/named-select";
import { Field, PageHeader, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { CONTACT_CATEGORIES, CONTACT_MODES } from "~/lib/constants";
import { schoolToday } from "~/lib/dates";
import {
  QUICK_ADD_FIELDS,
  listOwners,
  parseQuickAddForm,
  quickAddContact,
  type QuickAddErrors,
  type QuickAddField,
} from "~/lib/directory.server";
import type { DuplicateCandidate } from "~/lib/duplicates.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("directory.quick.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  return {
    owners: await listOwners(admin),
    meId: admin.id,
    today: schoolToday(),
    /** From an organization page: "Add someone here". */
    organization: (url.searchParams.get("org") ?? "").slice(0, 200),
  };
}

type ActionData = {
  errors: QuickAddErrors;
  duplicates: DuplicateCandidate[];
  fingerprint: string | null;
  /** What was typed, so the form keeps it even without JavaScript. */
  values: QuickAddValues;
};

type QuickAddValues = Partial<Record<QuickAddField, string>> & { categories: string[]; directory_visible: boolean; contact_mode: string };

function valuesOf(form: FormData): QuickAddValues {
  const values: QuickAddValues = {
    categories: form.getAll("categories").filter((v): v is string => typeof v === "string"),
    directory_visible: form.get("directory_visible") === "on",
    contact_mode: String(form.get("contact_mode") ?? "introduction"),
  };
  for (const field of QUICK_ADD_FIELDS) {
    const v = form.get(field);
    if (typeof v === "string") values[field] = v.slice(0, 4000);
  }
  return values;
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const form = await request.formData();
  const parsed = parseQuickAddForm(form);
  const values = valuesOf(form);
  if (!parsed.ok) return data<ActionData>({ errors: parsed.errors, duplicates: [], fingerprint: null, values }, { status: 400 });

  const confirmed = form.get("confirm");
  const result = await quickAddContact(admin, parsed.input, { confirmed: typeof confirmed === "string" ? confirmed : null });
  if (result.status === "invalid") return data<ActionData>({ errors: result.errors, duplicates: [], fingerprint: null, values }, { status: 400 });
  if (result.status === "duplicates") {
    return data<ActionData>({ errors: {}, duplicates: result.duplicates, fingerprint: result.fingerprint, values }, { status: 409 });
  }
  return redirect(`/app/people/${result.personId}`);
}

const pill =
  "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-stone bg-canvas px-3.5 py-1.5 text-sm text-graphite transition-colors select-none hover:bg-taupe has-checked:border-ink has-checked:bg-gold-soft has-checked:text-ink has-focus-visible:ring-3 has-focus-visible:ring-ring/50";

function DuplicateWarning({ duplicates, fingerprint }: { duplicates: DuplicateCandidate[]; fingerprint: string }) {
  const { t } = useT();
  return (
    <section
      role="alert"
      aria-labelledby="dup-title"
      className="grid gap-3 rounded-card border border-gold bg-gold-soft p-4 md:p-5"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden="true" />
        <div>
          <h2 id="dup-title" className="font-medium text-ink">
            {t("directory.quick.dupTitle")}
          </h2>
          <p className="text-sm text-graphite">{t("directory.quick.dupBody")}</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {duplicates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas p-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {d.full_name}
                {d.organization_name && <span className="font-normal text-smoke">, {d.organization_name}</span>}
              </p>
              <p className="text-xs text-smoke">
                {d.reasons.map((r) => t(`directory.quick.dupReason.${r}`)).join(" · ")}
                {(d.email || d.phone) && <span> · {[d.email, d.phone].filter(Boolean).join(" · ")}</span>}
                {!d.directory_visible && <span> · {t("directory.quick.dupHidden")}</span>}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/app/people/${d.id}`} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                {t("directory.quick.dupOpen")}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button type="submit" name="confirm" value={fingerprint} variant="outline">
          {t("directory.quick.saveAnyway")}
        </Button>
      </div>
    </section>
  );
}

export default function QuickAdd() {
  const { owners, meId, today, organization } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { t } = useT();
  const errors = actionData?.errors ?? {};
  const e = (field: keyof QuickAddErrors) => (errors[field] ? t(errors[field]) : undefined);
  const saving = navigation.state === "submitting";
  const moreError = Boolean(errors.title || errors.origin || errors.owner_user_id);
  const v = actionData?.values;
  const value = (field: QuickAddField) => v?.[field] ?? "";

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader eyebrow={t("directory.adminTitle")} title={t("directory.quick.title")} description={t("directory.quick.description")} />

      <Form method="post" className="grid gap-5" noValidate>
        <Panel bodyClassName="grid gap-4">
          <Field label={t("directory.quick.name")} htmlFor="qa-name" error={e("full_name")}>
            <Input id="qa-name" name="full_name" defaultValue={value("full_name")} required maxLength={200} autoComplete="off" aria-invalid={!!errors.full_name || undefined} />
          </Field>
          <Field label={t("directory.quick.organization")} htmlFor="qa-org" optional error={e("organization_name")}>
            <Input id="qa-org" name="organization_name" maxLength={200} defaultValue={v ? value("organization_name") : organization} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("directory.quick.email")} htmlFor="qa-email" error={e("email")} hint={t("directory.quick.contactHint")}>
              <Input id="qa-email" name="email" defaultValue={value("email")} type="email" maxLength={254} autoComplete="off" aria-invalid={!!errors.email || undefined} />
            </Field>
            <Field label={t("directory.quick.phone")} htmlFor="qa-phone" error={e("phone")}>
              <Input id="qa-phone" name="phone" defaultValue={value("phone")} type="tel" maxLength={40} autoComplete="off" />
            </Field>
          </div>
          <Field label={t("directory.quick.notes")} htmlFor="qa-notes" optional hint={t("directory.quick.notesHint")} error={e("notes")}>
            <Textarea
              id="qa-notes"
              name="notes"
              defaultValue={value("notes")}
              rows={3}
              maxLength={4000}
              placeholder={t("directory.quick.notesPlaceholder")}
              className="bg-canvas"
            />
          </Field>

          <details open={moreError || undefined} className="group rounded-lg border border-stone bg-canvas/60 p-4">
            <summary className="w-fit cursor-pointer rounded-full text-sm font-medium text-graphite hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              {t("directory.quick.more")}
            </summary>
            <div className="mt-4 grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium text-graphite">{t("directory.quick.categories")}</legend>
                <div className="flex flex-wrap gap-2">
                  {CONTACT_CATEGORIES.map((category) => (
                    <label key={category} className={pill}>
                      <input type="checkbox" name="categories" value={category} defaultChecked={v?.categories.includes(category)} className="sr-only" />
                      {t(`common.category.${category}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("directory.quick.title_field")} htmlFor="qa-title" optional error={e("title")}>
                  <Input id="qa-title" name="title" defaultValue={value("title")} maxLength={200} />
                </Field>
                <Field label={t("directory.quick.owner")} htmlFor="qa-owner" error={e("owner_user_id")}>
                  <NamedSelect
                    id="qa-owner"
                    name="owner_user_id"
                    defaultValue={v ? value("owner_user_id") || "none" : owners.some((o) => o.id === meId) ? meId : "none"}
                    options={[{ value: "none", label: t("directory.quick.noOwner") }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
                  />
                </Field>
              </div>
              <Field label={t("directory.quick.origin")} htmlFor="qa-origin" optional error={e("origin")}>
                <Input id="qa-origin" name="origin" defaultValue={value("origin")} maxLength={500} placeholder={t("directory.quick.originPlaceholder")} />
              </Field>
              <label className="flex items-start gap-3 text-sm text-graphite">
                <input type="checkbox" name="directory_visible" defaultChecked={v?.directory_visible} className="mt-0.5 size-4 accent-ink" />
                <span>
                  <span className="font-medium text-ink">{t("directory.quick.visibility")}</span>
                  <span className="block text-xs text-smoke">{t("directory.quick.visibilityHint")}</span>
                </span>
              </label>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium text-graphite">{t("directory.quick.mode")}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CONTACT_MODES.map((mode) => (
                    <label key={mode} className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone bg-canvas p-3 text-sm has-checked:border-ink has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                      <input type="radio" name="contact_mode" value={mode} defaultChecked={mode === (v?.contact_mode === "direct" ? "direct" : "introduction")} className="mt-0.5 accent-ink" />
                      <span>
                        <span className="font-medium text-ink">{t(`common.contactMode.${mode}`)}</span>
                        <span className="block text-xs text-smoke">{t(`common.contactModeHelp.${mode}`)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </details>
        </Panel>

        <Panel title={t("directory.quick.followUp")} bodyClassName="grid gap-4">
          <p className="-mt-2 text-sm text-smoke">{t("directory.quick.followUpHint")}</p>
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <Field label={t("directory.quick.followUpOn")} htmlFor="qa-fu-on" error={e("follow_up_on")}>
              <Input id="qa-fu-on" name="follow_up_on" defaultValue={value("follow_up_on")} type="date" min={today} aria-invalid={!!errors.follow_up_on || undefined} />
            </Field>
            <Field label={t("directory.quick.followUpAction")} htmlFor="qa-fu-action" error={e("follow_up_action")}>
              <Input
                id="qa-fu-action"
                name="follow_up_action"
                defaultValue={value("follow_up_action")}
                maxLength={500}
                placeholder={t("directory.quick.followUpActionPlaceholder")}
                aria-invalid={!!errors.follow_up_action || undefined}
              />
            </Field>
          </div>
        </Panel>

        {actionData?.duplicates.length && actionData.fingerprint ? (
          <DuplicateWarning duplicates={actionData.duplicates} fingerprint={actionData.fingerprint} />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="brand" size="lg" disabled={saving}>
            {saving ? t("directory.quick.saving") : t("directory.quick.save")}
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/app/people">{t("common.action.cancel")}</Link>
          </Button>
        </div>
      </Form>
    </div>
  );
}

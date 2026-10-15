/** Add a person by hand (admins only). Refuses a second person with the same email. */
import { data, redirect, useActionData } from "react-router";
import type { Route } from "./+types/app.people.new";
import { PersonForm } from "~/components/people/person-form";
import { PageHeader } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { parsePersonForm, type PersonFormErrors } from "~/lib/people-form.server";
import { createPerson, findPersonByEmail } from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("people.new.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const parsed = parsePersonForm(await request.formData());
  if (!parsed.ok) return data({ errors: parsed.errors, duplicateId: null as string | null }, { status: 400 });

  if (parsed.input.email) {
    const existing = await findPersonByEmail(parsed.input.email);
    if (existing) return data({ errors: {} as PersonFormErrors, duplicateId: existing.id }, { status: 409 });
  }
  const id = await createPerson({ ...parsed.input, source: "admin" }, admin.id);
  return redirect(`/app/people/${id}`);
}

export default function NewPerson() {
  const { t } = useT();
  const actionData = useActionData<typeof action>();
  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader eyebrow={t("people.title")} title={t("people.new.title")} description={t("people.new.description")} />
      <PersonForm
        errors={actionData?.errors}
        duplicateId={actionData?.duplicateId}
        submitLabel={t("people.form.submitCreate")}
        cancelTo="/app/people"
      />
    </div>
  );
}

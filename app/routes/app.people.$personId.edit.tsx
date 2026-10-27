/** Edit a person (admins only). Keeps where they came from (source) as it was. */
import { data, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/app.people.$personId.edit";
import { PersonForm } from "~/components/people/person-form";
import { DeletePersonDialog } from "~/components/people/profile-sections";
import { PageHeader } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { query } from "~/lib/db.server";
import { parsePersonForm, type PersonFormErrors } from "~/lib/people-form.server";
import { findPersonByEmail, getPerson, updatePerson } from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("people.edit.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const person = await getPerson(params.personId, admin);
  if (!person) throw data(null, { status: 404 });
  return { person };
}

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const person = await getPerson(params.personId, admin);
  if (!person) throw data(null, { status: 404 });

  const parsed = parsePersonForm(await request.formData());
  if (!parsed.ok) return data({ errors: parsed.errors, duplicateId: null as string | null }, { status: 400 });

  if (parsed.input.email) {
    const existing = await findPersonByEmail(parsed.input.email);
    if (existing && existing.id !== person.id) {
      return data({ errors: {} as PersonFormErrors, duplicateId: existing.id }, { status: 409 });
    }
  }
  await updatePerson(person.id, parsed.input);
  // upsertOrganization keeps an existing organization's kind, but this form
  // shows the kind, so a change here should stick (for everyone at that org).
  if (parsed.input.organization_name && parsed.input.organization_kind) {
    await query("UPDATE organizations SET kind = $2, updated_at = now() WHERE lower(name) = lower($1) AND kind <> $2", [
      parsed.input.organization_name,
      parsed.input.organization_kind,
    ]);
  }
  return redirect(`/app/people/${person.id}`);
}

export default function EditPerson() {
  const { person } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useT();
  return (
    <div className="grid max-w-4xl gap-6">
      <PageHeader
        eyebrow={t("people.edit.title")}
        title={t("people.edit.heading", { name: person.full_name })}
        description={t("people.edit.description")}
      />
      <PersonForm
        defaults={person}
        errors={actionData?.errors}
        duplicateId={actionData?.duplicateId}
        submitLabel={t("common.action.saveChanges")}
        cancelTo={`/app/people/${person.id}`}
      />
      <div className="flex justify-end border-t border-stone pt-4">
        <DeletePersonDialog name={person.full_name} action={`/app/people/${person.id}`} />
      </div>
    </div>
  );
}

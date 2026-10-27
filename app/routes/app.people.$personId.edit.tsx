/**
 * Edit a person (admins only): who they are, how they help, and the CRM
 * fields (categories, owner, how the relationship began, staff access and the
 * summary staff see). Keeps where they came from (source) as it was.
 *
 * When the name or email changes, likely duplicates are listed first and the
 * admin confirms with "Save anyway". Another record with the same email
 * always blocks the save.
 */
import { data, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/app.people.$personId.edit";
import { PersonForm, type PersonFormDuplicate } from "~/components/people/person-form";
import { DeletePersonDialog } from "~/components/people/profile-sections";
import { PageHeader } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { query } from "~/lib/db.server";
import { findDuplicates, normalizeEmail, normalizeName } from "~/lib/duplicates.server";
import { listCrmOwners } from "~/lib/opportunities.server";
import { parsePersonForm, type PersonFormErrors } from "~/lib/people-form.server";
import { getPerson, updatePerson } from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("people.edit.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const person = await getPerson(params.personId, admin);
  if (!person) throw data(null, { status: 404 });
  return { person, owners: await listCrmOwners(admin) };
}

type EditActionData = {
  errors: PersonFormErrors;
  duplicateId: string | null;
  duplicates: PersonFormDuplicate[];
};

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const person = await getPerson(params.personId, admin);
  if (!person) throw data(null, { status: 404 });

  const form = await request.formData();
  const parsed = parsePersonForm(form);
  const reply = (body: Partial<EditActionData>, status: number) =>
    data<EditActionData>({ errors: {}, duplicateId: null, duplicates: [], ...body }, { status });
  if (!parsed.ok) return reply({ errors: parsed.errors }, 400);
  const input = parsed.input;

  if (input.owner_user_id && !(await listCrmOwners(admin)).some((o) => o.id === input.owner_user_id)) {
    return reply({ errors: { owner_user_id: "people.form.errorOwner" } }, 400);
  }

  const nameChanged = normalizeName(input.full_name) !== normalizeName(person.full_name);
  const emailChanged = normalizeEmail(input.email) !== normalizeEmail(person.email);
  if (nameChanged || emailChanged) {
    const candidates = await findDuplicates(
      {
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        organization_name: input.organization_name,
      },
      { excludeId: person.id, limit: 5 },
    );
    const sameEmail = emailChanged && input.email ? candidates.find((c) => c.reasons.includes("email")) : undefined;
    if (sameEmail) return reply({ duplicateId: sameEmail.id }, 409);
    if (candidates.length && form.get("confirm_duplicates") !== "1") {
      return reply(
        {
          duplicates: candidates.map(({ id, full_name, email, organization_name, directory_visible, reasons }) => ({
            id,
            full_name,
            email,
            organization_name,
            directory_visible,
            reasons,
          })),
        },
        409,
      );
    }
  }

  await updatePerson(person.id, input);
  // upsertOrganization keeps an existing organization's kind, but this form
  // shows the kind, so a change here should stick (for everyone at that org).
  if (input.organization_name && input.organization_kind) {
    await query("UPDATE organizations SET kind = $2, updated_at = now() WHERE lower(name) = lower($1) AND kind <> $2", [
      input.organization_name,
      input.organization_kind,
    ]);
  }
  return redirect(`/app/people/${person.id}`);
}

export default function EditPerson() {
  const { person, owners } = useLoaderData<typeof loader>();
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
        duplicates={actionData?.duplicates}
        owners={owners}
        submitLabel={t("common.action.saveChanges")}
        cancelTo={`/app/people/${person.id}`}
      />
      <div className="flex justify-end border-t border-stone pt-4">
        <DeletePersonDialog name={person.full_name} action={`/app/people/${person.id}`} />
      </div>
    </div>
  );
}

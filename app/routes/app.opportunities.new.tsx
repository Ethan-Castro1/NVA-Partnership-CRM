/**
 * /app/opportunities/new (admins only). ?person=<id> picks the person and
 * ?track=funding starts on the funding track.
 */
import { Link, data, redirect, useActionData, useLoaderData } from "react-router";
import { ArrowLeft } from "lucide-react";
import type { Route } from "./+types/app.opportunities.new";
import { OpportunityForm } from "~/components/crm/opportunity-form";
import { PageHeader, Sheet } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { OPPORTUNITY_TRACKS, type OpportunityTrack } from "~/lib/constants";
import {
  OpportunityInputError,
  createOpportunity,
  getCrmFormOptions,
  parseOpportunityForm,
} from "~/lib/opportunities.server";
import { requireAdminViewer } from "~/lib/permissions.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("crm.opps.new.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminViewer(request);
  const params = new URL(request.url).searchParams;
  const options = await getCrmFormOptions(user);
  const person = params.get("person");
  const trackParam = params.get("track");
  return {
    ...options,
    personId: person && options.people.some((p) => p.id === person) ? person : null,
    track: (OPPORTUNITY_TRACKS as readonly string[]).includes(trackParam ?? "") ? (trackParam as OpportunityTrack) : "engagement",
    userId: user.id,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdminViewer(request);
  const parsed = parseOpportunityForm(await request.formData());
  if (!parsed.ok) return data({ errors: parsed.errors }, { status: 400 });
  try {
    const id = await createOpportunity(user, parsed.value);
    return redirect(`/app/opportunities/${id}`);
  } catch (error) {
    if (error instanceof OpportunityInputError) {
      return data({ errors: { personId: "crm.error.badChoice" as const } }, { status: 400 });
    }
    throw error;
  }
}

export default function NewOpportunity() {
  const { people, caps, owners, personId, track, userId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useT();
  const backTo = personId ? `/app/people/${personId}` : "/app/opportunities";
  return (
    <div className="mx-auto grid min-w-0 grid-cols-[minmax(0,1fr)] w-full max-w-3xl gap-6">
      <Link to={backTo} className="inline-flex w-fit items-center gap-1.5 text-sm text-graphite hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {personId ? people.find((p) => p.id === personId)?.full_name : t("crm.opps.back")}
      </Link>
      <PageHeader title={t("crm.opps.new.title")} />
      <Sheet className="p-6 md:p-8">
        <OpportunityForm
          people={people}
          caps={caps}
          owners={owners}
          values={{ personId, track, ownerUserId: userId }}
          errors={actionData?.errors}
          submitLabel={t("crm.opps.form.create")}
          pendingLabel={t("crm.opps.form.creating")}
          submitVariant="brand"
          cancelTo={backTo}
        />
      </Sheet>
    </div>
  );
}

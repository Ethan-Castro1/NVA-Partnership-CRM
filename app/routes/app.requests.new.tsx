/**
 * New staff request. Accepts ?person=<id> (pre-fills "Someone in mind?") and
 * &intro=1 (ticks "Please introduce me"), as linked from ResourceActions.
 * A person the viewer can't see is ignored here and refused on submit.
 */
import { Link, data, redirect } from "react-router";
import { ArrowLeft } from "lucide-react";
import type { Route } from "./+types/app.requests.new";
import { PageHeader, Sheet } from "~/components/nva";
import { RequestForm } from "~/components/requests";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { canViewPerson } from "~/lib/permissions.server";
import { createRequest, listCapOptions, listPersonOptions, requestInputFromForm } from "~/lib/requests.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("requests.new.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const wanted = url.searchParams.get("person")?.trim() ?? "";
  const personId = wanted && (await canViewPerson(user, wanted)) ? wanted : null;
  const [caps, people] = await Promise.all([listCapOptions(), listPersonOptions(user)]);
  const person = personId ? people.find((p) => p.id === personId) : undefined;
  const intro = Boolean(person) && url.searchParams.get("intro") === "1";
  return {
    caps,
    people,
    defaults: { personId: person?.id ?? null, intro },
    introName: intro && person ? person.full_name : null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const result = await createRequest(user, requestInputFromForm(await request.formData()));
  if (!result.ok) return data({ errors: result.errors }, { status: 400 });
  return redirect(`/app/requests/${result.id}`);
}

export default function NewRequest({ loaderData, actionData }: Route.ComponentProps) {
  const { t } = useT();
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Link to="/app/requests" className="inline-flex w-fit items-center gap-1.5 text-sm text-graphite hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("requests.new.back")}
      </Link>
      <PageHeader title={t("requests.new.title")} description={t("requests.new.description")} />
      <Sheet className="p-6 md:p-8">
        <RequestForm
          caps={loaderData.caps}
          people={loaderData.people}
          defaults={{
            ...loaderData.defaults,
            need: loaderData.introName ? t("requests.new.introNeed", { name: loaderData.introName }) : "",
          }}
          errors={actionData?.errors}
          submitLabel={t("requests.form.submit")}
          pendingLabel={t("requests.form.sending")}
          cancelTo="/app/requests"
        />
      </Sheet>
    </div>
  );
}

/** Start a new CAP. The signed-in teacher becomes its owner. */
import { Link, data, redirect, useActionData } from "react-router";
import { ArrowLeft } from "lucide-react";
import type { Route } from "./+types/app.caps.new";
import { CapForm } from "~/components/caps/cap-form";
import { PageHeader, Sheet } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { createCap, parseCapForm } from "~/lib/caps.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("caps.new.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const parsed = parseCapForm(await request.formData());
  if (!parsed.ok) return data({ errors: parsed.errors }, { status: 400 });
  const id = await createCap(parsed.value, user.id);
  return redirect(`/app/caps/${id}`);
}

export default function NewCap() {
  const { t } = useT();
  const actionData = useActionData<typeof action>();
  return (
    <div className="mx-auto grid min-w-0 grid-cols-[minmax(0,1fr)] w-full max-w-3xl gap-6">
      <Link to="/app/caps" className="inline-flex w-fit items-center gap-1.5 text-sm text-graphite hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("caps.detail.backToList")}
      </Link>
      <PageHeader eyebrow={t("caps.eyebrow")} title={t("caps.new.title")} description={t("caps.new.description")} />
      <Sheet className="p-6 md:p-8">
        <CapForm
          errors={actionData?.errors}
          submitLabel={t("caps.form.create")}
          pendingLabel={t("caps.form.creating")}
          cancelTo="/app/caps"
        />
      </Sheet>
    </div>
  );
}

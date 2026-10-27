/**
 * Placeholder for /app/people/:personId/email (U6). Admins only.
 * Registered early by the foundation so the route map is complete; U6 replaces this file.
 */
import type { Route } from "./+types/app.people.$personId.email";
import { PageHeader } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { getPerson } from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("common.state.comingSoon")} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!(await getPerson(params.personId, admin))) throw new Response("Not found", { status: 404 });
  return null;
}

export default function ComingSoon() {
  const { t } = useT();
  return <PageHeader title={t("common.state.comingSoon")} />;
}

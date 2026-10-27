/**
 * Placeholder for /app/opportunities/:opportunityId (U3). Admins only.
 * Registered early by the foundation so the route map is complete; U3 replaces this file.
 */
import type { Route } from "./+types/app.opportunities.$opportunityId";
import { PageHeader } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("common.state.comingSoon")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export default function ComingSoon() {
  const { t } = useT();
  return <PageHeader title={t("common.state.comingSoon")} />;
}

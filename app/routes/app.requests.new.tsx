/**
 * Placeholder for /app/requests/new (U4). Staff and admins.
 * Registered early by the foundation so the route map is complete; U4 replaces this file.
 */
import type { Route } from "./+types/app.requests.new";
import { PageHeader } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("common.state.comingSoon")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export default function ComingSoon() {
  const { t } = useT();
  return <PageHeader title={t("common.state.comingSoon")} />;
}

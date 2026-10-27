/**
 * Placeholder for /app/requests/:requestId (U4). Staff (their own requests) and admins.
 * Registered early by the foundation so the route map is complete; U4 replaces this file.
 */
import type { Route } from "./+types/app.requests.$requestId";
import { PageHeader } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { queryOne } from "~/lib/db.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("common.state.comingSoon")} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  // Staff see only their own requests; someone else's looks the same as a missing one.
  const row = await queryOne<{ requester_id: string }>("SELECT requester_id FROM staff_requests WHERE id = $1", [params.requestId]);
  if (!row || (user.role !== "admin" && row.requester_id !== user.id)) throw new Response("Not found", { status: 404 });
  return null;
}

export default function ComingSoon() {
  const { t } = useT();
  return <PageHeader title={t("common.state.comingSoon")} />;
}

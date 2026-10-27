/** My Requests: the signed-in user's own staff requests (admins see everyone's at /app/admin/requests). */
import { Link } from "react-router";
import { Plus } from "lucide-react";
import type { Route } from "./+types/app.requests._index";
import { EmptyState, PageHeader, Panel } from "~/components/nva";
import { RequestRows } from "~/components/requests";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { ACTIVE_REQUEST_STATUSES, listRequests } from "~/lib/requests.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("requests.index.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const requests = await listRequests(user, { mine: true });
  return {
    active: requests.filter((r) => ACTIVE_REQUEST_STATUSES.includes(r.status)),
    past: requests.filter((r) => !ACTIVE_REQUEST_STATUSES.includes(r.status)),
    isAdmin: user.role === "admin",
  };
}

export default function MyRequests({ loaderData }: Route.ComponentProps) {
  const { t } = useT();
  const { active, past, isAdmin } = loaderData;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        title={t("requests.index.title")}
        description={t("requests.index.description")}
        actions={
          <>
            {isAdmin && (
              <Button asChild variant="outline">
                <Link to="/app/admin/requests">{t("requests.index.allRequests")}</Link>
              </Button>
            )}
            <Button asChild variant="brand">
              <Link to="/app/requests/new">
                <Plus aria-hidden="true" />
                {t("requests.index.new")}
              </Link>
            </Button>
          </>
        }
      />
      {active.length === 0 && past.length === 0 ? (
        <EmptyState title={t("requests.index.empty.title")} body={t("requests.index.empty.body")} />
      ) : (
        <>
          {active.length > 0 && (
            <Panel title={t("requests.index.active")}>
              <RequestRows requests={active} />
            </Panel>
          )}
          {past.length > 0 && (
            <Panel title={t("requests.index.past")}>
              <RequestRows requests={past} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

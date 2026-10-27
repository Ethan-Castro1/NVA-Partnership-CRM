/** My Connections: people the signed-in user saved, requested or worked with (only people they can still see). */
import { Link } from "react-router";
import type { Route } from "./+types/app.my-connections";
import { EmptyState, PageHeader, PersonAvatar } from "~/components/nva";
import { ResourceActions } from "~/components/resources/resource-actions";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { listMyConnections } from "~/lib/requests.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("requests.connections.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { connections: await listMyConnections(user) };
}

function Reason({ children, tone }: { children: string; tone: "gold" | "blue" | "sage" }) {
  const styles = { gold: "bg-gold-soft text-gold-ink", blue: "bg-blue-soft text-blue-ink", sage: "bg-sage-soft text-sage-ink" };
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", styles[tone])}>{children}</span>;
}

export default function MyConnections({ loaderData }: Route.ComponentProps) {
  const { t } = useT();
  const { connections } = loaderData;
  return (
    <div className="mx-auto grid min-w-0 grid-cols-[minmax(0,1fr)] w-full max-w-3xl gap-6">
      <PageHeader title={t("requests.connections.title")} description={t("requests.connections.description")} />
      {connections.length === 0 ? (
        <EmptyState
          title={t("requests.connections.empty.title")}
          body={t("requests.connections.empty.body")}
          action={
            <Button asChild variant="outline">
              <Link to="/app/people">{t("requests.connections.browse")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-card border border-stone bg-canvas p-4">
              <div className="flex items-start gap-3">
                <PersonAvatar name={c.full_name} />
                <div className="grid min-w-0 gap-1">
                  <Link to={`/app/people/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                    {c.full_name}
                  </Link>
                  {(c.title || c.organization_name) && (
                    <p className="text-sm text-smoke">{[c.title, c.organization_name].filter(Boolean).join(", ")}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {c.worked_with && <Reason tone="sage">{t("requests.connections.reason.workedWith")}</Reason>}
                    {c.requested && !c.worked_with && <Reason tone="blue">{t("requests.connections.reason.requested")}</Reason>}
                    {c.saved && <Reason tone="gold">{t("requests.connections.reason.saved")}</Reason>}
                  </div>
                  {c.last_request_id && c.last_request_need && (
                    <Link to={`/app/requests/${c.last_request_id}`} className="text-xs text-graphite underline-offset-4 hover:underline">
                      {t("requests.connections.lastRequest", { need: c.last_request_need })}
                    </Link>
                  )}
                </div>
              </div>
              <ResourceActions person={c} saved={c.saved} compact />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

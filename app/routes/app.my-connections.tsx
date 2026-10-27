/** My Connections: people the signed-in user saved, requested or worked with (only people they can still see). */
import { Link } from "react-router";
import type { Route } from "./+types/app.my-connections";
import { EmptyState, PageHeader, PersonAvatar, Sheet } from "~/components/nva";
import { ResourceActions } from "~/components/resources/resource-actions";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { listMyConnections } from "~/lib/requests.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("requests.connections.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { connections: await listMyConnections(user) };
}

/** Why someone is here, as quiet text; links to the last request when there is one. */
function ReasonText({ c }: { c: Route.ComponentProps["loaderData"]["connections"][number] }) {
  const { t } = useT();
  const reasons = [
    c.worked_with && t("requests.connections.reason.workedWith"),
    c.requested && !c.worked_with && t("requests.connections.reason.requested"),
    c.saved && !c.worked_with && !c.requested && t("requests.connections.reason.saved"),
  ].filter(Boolean) as string[];
  if (!reasons.length) return null;
  const text = reasons.join(", ");
  if (c.last_request_id && c.last_request_need) {
    return (
      <Link
        to={`/app/requests/${c.last_request_id}`}
        title={t("requests.connections.lastRequest", { need: c.last_request_need })}
        aria-label={t("requests.connections.lastRequest", { need: c.last_request_need })}
        className="relative z-10 underline decoration-stone underline-offset-4 hover:text-ink hover:decoration-gold"
      >
        {text}
      </Link>
    );
  }
  return <span>{text}</span>;
}

export default function MyConnections({ loaderData }: Route.ComponentProps) {
  const { t } = useT();
  const { connections } = loaderData;
  const count = connections.length === 1 ? t("directory.countOne") : t("directory.countMany", { count: connections.length });
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("requests.connections.title")}
        description={connections.length ? <span className="font-medium text-graphite">{count}</span> : undefined}
      />
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
        <Sheet className="p-0">
          <ul className="divide-y divide-stone">
            {connections.map((c) => {
              const subtitle = [c.title, c.organization_name].filter(Boolean).join(", ");
              return (
                <li
                  key={c.id}
                  className="relative flex flex-col gap-2 px-4 py-3 hover:bg-taupe/60 focus-within:bg-taupe/60 sm:flex-row sm:items-center sm:gap-3 sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <PersonAvatar name={c.full_name} className="size-8" />
                    <div className="min-w-0">
                      <Link
                        to={`/app/people/${c.id}`}
                        prefetch="intent"
                        className="block truncate text-sm font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none"
                      >
                        {c.full_name}
                      </Link>
                      <p className="truncate text-xs text-smoke">
                        {subtitle}
                        {subtitle && <span aria-hidden="true"> · </span>}
                        <ReasonText c={c} />
                      </p>
                    </div>
                  </div>
                  <ResourceActions person={c} saved={c.saved} compact className="shrink-0 pl-11 sm:pl-0" />
                </li>
              );
            })}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

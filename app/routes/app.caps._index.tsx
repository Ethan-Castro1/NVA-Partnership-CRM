/** Current (or finished) Community Action Projects, all or just mine, as a grid of cards. */
import { Link, useLoaderData } from "react-router";
import { Plus } from "lucide-react";
import type { Route } from "./+types/app.caps._index";
import { CapRows } from "~/components/caps/cap-bits";
import { SegmentedLinks } from "~/components/crm/crm-bits";
import { PageHeader, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { listCaps, listMyCaps } from "~/lib/caps.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("caps.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const params = new URL(request.url).searchParams;
  const mine = params.get("show") === "mine";
  const finished = params.get("state") === "finished";
  // "Mine": CAPs this person teaches or started. Partner counts are scoped to the viewer.
  const caps = mine
    ? (await listMyCaps(user, { includeComplete: true })).filter((c) => (c.status === "complete") === finished)
    : await listCaps(finished ? { status: "complete" } : { excludeComplete: true }, user);
  return { caps, mine, finished };
}

function capsUrl(mine: boolean, finished: boolean): string {
  const params = new URLSearchParams();
  if (mine) params.set("show", "mine");
  if (finished) params.set("state", "finished");
  const qs = params.toString();
  return qs ? `/app/caps?${qs}` : "/app/caps";
}

export default function Caps() {
  const { caps, mine, finished } = useLoaderData<typeof loader>();
  const { t } = useT();
  const whose = [
    { to: capsUrl(false, finished), label: t("caps.list.all"), current: !mine },
    { to: capsUrl(true, finished), label: t("caps.list.mine"), current: mine },
  ];
  const state = [
    { to: capsUrl(mine, false), label: t("caps.list.current"), current: !finished },
    { to: capsUrl(mine, true), label: t("caps.list.finished"), current: finished },
  ];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={t("caps.title")}
        description={
          <span className="font-medium text-graphite">{caps.length === 1 ? t("caps.list.countOne") : t("caps.list.count", { count: caps.length })}</span>
        }
        actions={
          <Button asChild variant="brand" size="lg">
            <Link to="/app/caps/new">
              <Plus aria-hidden="true" />
              {t("caps.list.new")}
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <SegmentedLinks label={t("caps.list.tabsLabel")} tabs={whose} />
        <SegmentedLinks label={t("caps.list.stateLabel")} tabs={state} />
      </div>

      {caps.length ? (
        <Sheet className="px-4 py-1 md:px-5">
          <CapRows caps={caps} />
        </Sheet>
      ) : (
        <p className="text-sm text-smoke">
          {finished ? t("caps.list.emptyFinished") : mine ? t("caps.list.emptyMine") : t("caps.list.empty")}
        </p>
      )}
    </div>
  );
}

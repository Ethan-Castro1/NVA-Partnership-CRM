/** Current (or finished) Community Action Projects, all or just mine, as a grid of cards. */
import { Link, useLoaderData } from "react-router";
import { Plus } from "lucide-react";
import type { Route } from "./+types/app.caps._index";
import { CapCard } from "~/components/caps/cap-bits";
import { EmptyState, PageHeader } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { listCaps, listMyCaps } from "~/lib/caps.server";
import { cn } from "~/lib/utils";

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
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow={t("caps.eyebrow")}
        title={t("caps.title")}
        description={t("caps.description")}
        actions={
          <Button asChild variant="brand" size="lg">
            <Link to="/app/caps/new">
              <Plus aria-hidden="true" />
              {t("caps.list.new")}
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Segmented label={t("caps.list.tabsLabel")} tabs={whose} />
        <Segmented label={t("caps.list.stateLabel")} tabs={state} />
      </div>

      {caps.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {caps.map((cap) => (
            <li key={cap.id}>
              <CapCard cap={cap} />
            </li>
          ))}
        </ul>
      ) : finished ? (
        <EmptyState title={t("caps.list.emptyFinished")} />
      ) : (
        <EmptyState
          title={mine ? t("caps.list.emptyMine") : t("caps.list.empty")}
          body={t("caps.list.emptyBody")}
          action={
            <Button asChild variant="outline">
              <Link to="/app/caps/new">
                <Plus aria-hidden="true" />
                {t("caps.list.new")}
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

function Segmented({ label, tabs }: { label: string; tabs: { to: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label}>
      <ul className="inline-flex rounded-full border border-stone bg-taupe p-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              aria-current={tab.current ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-full px-4 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                tab.current ? "bg-canvas font-medium text-ink shadow-whisper" : "text-graphite hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

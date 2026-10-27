/**
 * /app/opportunities (admins only): every opportunity, filtered by track
 * (engagement or funding), open or closed, stage, owner and a text search.
 * Filters live in the URL.
 */
import { Form, Link, useLoaderData } from "react-router";
import { Plus, Search } from "lucide-react";
import type { Route } from "./+types/app.opportunities._index";
import { SegmentedLinks, stageDot } from "~/components/crm/crm-bits";
import { OpportunityRows } from "~/components/crm/opportunities-panel";
import { EmptyState, PageHeader, Sheet } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { makeT, useT } from "~/i18n";
import { OPPORTUNITY_TRACKS, STAGES_BY_TRACK, type OpportunityStage, type OpportunityTrack } from "~/lib/constants";
import { schoolToday } from "~/lib/dates";
import { countOpportunitiesByStage, isStageOf, listOpportunities } from "~/lib/opportunities.server";
import { requireAdminViewer } from "~/lib/permissions.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("crm.opps.title")} | ${t("common.schoolName")}` }];
};

type State = "open" | "closed" | "all";
type Filters = { track: OpportunityTrack | null; state: State; stage: OpportunityStage | null; mine: boolean; q: string };

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminViewer(request);
  const params = new URL(request.url).searchParams;
  const trackParam = params.get("track");
  const track = (OPPORTUNITY_TRACKS as readonly string[]).includes(trackParam ?? "") ? (trackParam as OpportunityTrack) : null;
  const stageParam = params.get("stage") ?? "";
  const stage = track && isStageOf(track, stageParam) ? stageParam : null;
  const stateParam = params.get("state");
  const state: State = stage ? "all" : stateParam === "closed" || stateParam === "all" ? stateParam : "open";
  const mine = params.get("show") === "mine";
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const ownerUserId = mine ? user.id : undefined;
  const [opportunities, stageCounts] = await Promise.all([
    listOpportunities(user, { track: track ?? undefined, stage: stage ?? undefined, state, ownerUserId, q }),
    track ? countOpportunitiesByStage(user, { track, ownerUserId }) : Promise.resolve({} as Partial<Record<OpportunityStage, number>>),
  ]);
  const filters: Filters = { track, state, stage, mine, q };
  return { opportunities, stageCounts, filters, today: schoolToday() };
}

function listUrl(f: Filters, change: Partial<Filters>): string {
  const next = { ...f, ...change };
  const params = new URLSearchParams();
  if (next.track) params.set("track", next.track);
  if (next.stage && next.track) params.set("stage", next.stage);
  else if (next.state !== "open") params.set("state", next.state);
  if (next.mine) params.set("show", "mine");
  if (next.q) params.set("q", next.q);
  const qs = params.toString();
  return qs ? `/app/opportunities?${qs}` : "/app/opportunities";
}

export default function Opportunities() {
  const { opportunities, stageCounts, filters, today } = useLoaderData<typeof loader>();
  const { t } = useT();
  const count = opportunities.length;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <PageHeader
        eyebrow={t("crm.eyebrow")}
        title={t("crm.opps.title")}
        description={t("crm.opps.description")}
        actions={
          <Button asChild variant="brand" size="lg">
            <Link to={filters.track ? `/app/opportunities/new?track=${filters.track}` : "/app/opportunities/new"}>
              <Plus aria-hidden="true" />
              {t("crm.opps.new")}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedLinks
            label={t("crm.opps.filter.track")}
            tabs={[
              { to: listUrl(filters, { track: null, stage: null }), label: t("crm.opps.filter.allTracks"), current: !filters.track },
              ...OPPORTUNITY_TRACKS.map((track) => ({
                to: listUrl(filters, { track, stage: null }),
                label: t(`common.track.${track}`),
                current: filters.track === track,
              })),
            ]}
          />
          <SegmentedLinks
            label={t("crm.opps.filter.state")}
            tabs={(["open", "closed", "all"] as const).map((state) => ({
              to: listUrl(filters, { state, stage: null }),
              label: t(`crm.opps.filter.${state}`),
              current: !filters.stage && filters.state === state,
            }))}
          />
          <SegmentedLinks
            label={t("crm.filter.whose")}
            tabs={[
              { to: listUrl(filters, { mine: false }), label: t("crm.filter.everyone"), current: !filters.mine },
              { to: listUrl(filters, { mine: true }), label: t("crm.filter.mine"), current: filters.mine },
            ]}
          />
        </div>

        {filters.track && (
          <nav aria-label={t("crm.opps.filter.stages")}>
            <ul className="flex flex-wrap gap-1.5">
              {STAGES_BY_TRACK[filters.track].map((stage) => {
                const current = filters.stage === stage;
                return (
                  <li key={stage}>
                    <Link
                      to={current ? listUrl(filters, { stage: null, state: "open" }) : listUrl(filters, { stage })}
                      preventScrollReset
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        current ? "border-ink bg-canvas font-medium text-ink" : "border-stone bg-canvas text-graphite hover:border-ash",
                      )}
                    >
                      <span className={cn("size-2 rounded-full", stageDot(stage))} aria-hidden="true" />
                      {t(`common.stage.${stage}`)}
                      <span className="text-smoke tabular-nums">{stageCounts[stage] ?? 0}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <Form method="get" role="search" className="flex max-w-xl gap-2">
          {filters.track && <input type="hidden" name="track" value={filters.track} />}
          {filters.stage && <input type="hidden" name="stage" value={filters.stage} />}
          {!filters.stage && filters.state !== "open" && <input type="hidden" name="state" value={filters.state} />}
          {filters.mine && <input type="hidden" name="show" value="mine" />}
          <label htmlFor="opp-q" className="sr-only">
            {t("crm.opps.filter.search")}
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-smoke" aria-hidden="true" />
            <Input
              id="opp-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder={t("crm.opps.filter.searchPlaceholder")}
              className="h-10 bg-canvas pl-9"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10">
            {t("crm.opps.filter.submit")}
          </Button>
          {filters.q && (
            <Button asChild variant="ghost" className="h-10">
              <Link to={listUrl(filters, { q: "" })}>{t("crm.opps.filter.clear")}</Link>
            </Button>
          )}
        </Form>
      </div>

      {count ? (
        <div className="grid gap-2">
          <p className="text-sm text-smoke" aria-live="polite">
            {count === 1 ? t("crm.opps.list.countOne") : t("crm.opps.list.count", { count })}
          </p>
          <Sheet className="px-5 py-1">
            <OpportunityRows items={opportunities} today={today} showPerson />
          </Sheet>
        </div>
      ) : (
        <EmptyState title={t("crm.opps.list.empty")} body={t("crm.opps.list.emptyBody")} />
      )}
    </div>
  );
}

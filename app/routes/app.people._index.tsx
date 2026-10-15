/** The people directory: search and filter everyone in the village. */
import { Link, useLoaderData, useLocation, useNavigation } from "react-router";
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import type { Route } from "./+types/app.people._index";
import { DirectoryFilters } from "~/components/people/directory-filters";
import { PeopleResults } from "~/components/people/people-results";
import { EmptyState, PageHeader } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { query } from "~/lib/db.server";
import { PAGE_SIZE } from "~/lib/constants";
import { parseDirectoryParams } from "~/lib/people-form.server";
import { searchPeople } from "~/lib/people.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("people.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const { params, filter } = parseDirectoryParams(url.searchParams);
  const [{ people, total }, topicRows, everyone] = await Promise.all([
    searchPeople(filter),
    query<{ topic: string }>(
      "SELECT DISTINCT t AS topic FROM people, unnest(cap_topics) t WHERE status <> 'inactive' ORDER BY t LIMIT 200",
    ),
    query<{ n: number }>("SELECT count(*)::int AS n FROM people WHERE status <> 'inactive'"),
  ]);
  return {
    people,
    total,
    params,
    topics: topicRows.map((r) => r.topic),
    directorySize: everyone[0]?.n ?? 0,
    isAdmin: user.role === "admin",
  };
}

/** Same URL with a different ?page. */
function pageHref(search: string, page: number): string {
  const sp = new URLSearchParams(search);
  if (page <= 1) sp.delete("page");
  else sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/app/people?${qs}` : "/app/people";
}

export default function PeopleDirectory() {
  const { people, total, params, topics, directorySize, isAdmin } = useLoaderData<typeof loader>();
  const { t } = useT();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location.pathname === "/app/people";

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (params.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(params.page * PAGE_SIZE, total);
  const { search: currentSearch } = useLocation();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("people.title")}
        description={
          <span className="font-medium text-graphite">
            {directorySize === 1 ? t("people.dir.countOne") : t("people.dir.countMany", { count: directorySize })}
          </span>
        }
        actions={
          isAdmin && (
            <>
              <Button asChild variant="outline">
                <Link to="/app/admin/export.csv" reloadDocument>
                  <Download aria-hidden="true" />
                  {t("common.action.export")}
                </Link>
              </Button>
              <Button asChild variant="brand">
                <Link to="/app/people/new">
                  <Plus aria-hidden="true" />
                  {t("people.new.title")}
                </Link>
              </Button>
            </>
          )
        }
      />

      <DirectoryFilters params={params} topics={topics} />

      <section aria-labelledby="people-results" aria-busy={loading} className={cn("grid gap-3 transition-opacity", loading && "opacity-60")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="people-results" className="sr-only">
            {t("people.dir.resultsHeading")}
          </h2>
          {total > 0 && (
            <p className="text-sm text-smoke" aria-live="polite">
              {t("people.dir.showing", { from, to, total })}
              {params.q && <span className="block sm:inline sm:before:content-['_·_']">{t("people.dir.matchesFor", { q: params.q })}</span>}
            </p>
          )}
        </div>

        {people.length ? (
          <PeopleResults people={people} />
        ) : (
          <EmptyState
            title={directorySize ? t("people.dir.emptyTitle") : t("common.state.none")}
            body={directorySize ? t("people.dir.emptyBody") : t("people.dir.emptyNoPeople")}
            action={
              directorySize ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild variant="outline">
                    <Link to="/app/people">{t("people.dir.clear")}</Link>
                  </Button>
                  {isAdmin && (
                    <Button asChild variant="outline">
                      <Link to="/app/people/new">
                        <Plus aria-hidden="true" />
                        {t("people.new.title")}
                      </Link>
                    </Button>
                  )}
                </div>
              ) : undefined
            }
          />
        )}

        {pages > 1 && (
          <nav aria-label={t("people.dir.pagination")} className="flex items-center justify-between gap-3 pt-2">
            {params.page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link to={pageHref(currentSearch, params.page - 1)} rel="prev">
                  <ChevronLeft aria-hidden="true" />
                  {t("people.dir.previous")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-smoke">{t("people.dir.pageOf", { page: params.page, pages })}</span>
            {params.page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link to={pageHref(currentSearch, params.page + 1)} rel="next">
                  {t("people.dir.next")}
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  );
}

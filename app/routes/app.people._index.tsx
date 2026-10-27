/**
 * /app/people: one page for both roles.
 * Staff: "Browse People & Skills", the staff directory only, with why each
 * person matches and what they can do next. Admins: the full CRM directory
 * with CRM filters, the CSV export and quick add.
 */
import { Link, useLoaderData, useLocation, useNavigation } from "react-router";
import { Building2, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import type { Route } from "./+types/app.people._index";
import { DirectoryFilters } from "~/components/people/directory-filters";
import { PeopleResults } from "~/components/people/people-results";
import { EmptyState, PageHeader } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireUser } from "~/lib/auth.server";
import { PAGE_SIZE } from "~/lib/constants";
import { loadDirectory } from "~/lib/directory.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches, data }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const title = data?.isAdmin ? t("directory.adminTitle") : t("directory.staffTitle");
  return [{ title: `${title} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return loadDirectory(user, new URL(request.url).searchParams);
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
  const { people, total, params, topics, directorySize, isAdmin, savedIds, owners } = useLoaderData<typeof loader>();
  const { t } = useT();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location.pathname === "/app/people";

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? (params.page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(params.page * PAGE_SIZE, total);
  const { search: currentSearch } = useLocation();
  const count = directorySize === 1 ? t("directory.countOne") : t("directory.countMany", { count: directorySize });

  return (
    <div className="grid gap-6">
      <PageHeader
        title={isAdmin ? t("directory.adminTitle") : t("directory.staffTitle")}
        description={
          isAdmin ? (
            <span className="font-medium text-graphite">{count}</span>
          ) : (
            <>
              {t("directory.staffDescription")} <span className="font-medium text-graphite">{count}</span>
            </>
          )
        }
        actions={
          isAdmin && (
            <>
              <Button asChild variant="ghost">
                <Link to="/app/organizations">
                  <Building2 aria-hidden="true" />
                  {t("directory.organizations")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/admin/export.csv" reloadDocument>
                  <Download aria-hidden="true" />
                  {t("common.action.export")}
                </Link>
              </Button>
              <Button asChild variant="brand">
                <Link to="/app/people/new">
                  <Plus aria-hidden="true" />
                  {t("directory.addContact")}
                </Link>
              </Button>
            </>
          )
        }
      />

      <DirectoryFilters params={params} topics={topics} isAdmin={isAdmin} owners={owners} />

      <section aria-labelledby="people-results" aria-busy={loading} className={cn("grid gap-3 transition-opacity", loading && "opacity-60")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="people-results" className="sr-only">
            {t("directory.resultsHeading")}
          </h2>
          {total > 0 && (
            <p className="text-sm text-smoke" aria-live="polite">
              {t("directory.showing", { from, to, total })}
              {params.q && <span className="block sm:inline sm:before:content-['_·_']">{t("directory.matchesFor", { q: params.q })}</span>}
            </p>
          )}
        </div>

        {people.length ? (
          <PeopleResults people={people} savedIds={savedIds} isAdmin={isAdmin} />
        ) : (
          <EmptyState
            title={directorySize ? t("directory.emptyTitle") : t("common.state.none")}
            body={
              directorySize
                ? isAdmin
                  ? t("directory.emptyBody")
                  : t("directory.emptyBodyStaff")
                : isAdmin
                  ? t("directory.emptyNoPeople")
                  : t("directory.emptyNoPeopleStaff")
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {directorySize > 0 && (
                  <Button asChild variant="outline">
                    <Link to="/app/people">{t("directory.clear")}</Link>
                  </Button>
                )}
                {isAdmin ? (
                  <Button asChild variant="outline">
                    <Link to="/app/people/new">
                      <Plus aria-hidden="true" />
                      {t("directory.addContact")}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <Link to="/app/requests/new">{t("directory.askTeam")}</Link>
                  </Button>
                )}
              </div>
            }
          />
        )}

        {pages > 1 && (
          <nav aria-label={t("directory.pagination")} className="flex items-center justify-between gap-3 pt-2">
            {params.page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link to={pageHref(currentSearch, params.page - 1)} rel="prev">
                  <ChevronLeft aria-hidden="true" />
                  {t("directory.previous")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-smoke">{t("directory.pageOf", { page: params.page, pages })}</span>
            {params.page < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link to={pageHref(currentSearch, params.page + 1)} rel="next">
                  {t("directory.next")}
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

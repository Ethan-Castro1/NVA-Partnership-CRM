/** /app/organizations/:orgId (admins only): one organization, its people and their open opportunities. */
import { Link, useLoaderData } from "react-router";
import { ChevronLeft, Globe, Plus } from "lucide-react";
import type { Route } from "./+types/app.organizations.$orgId";
import { OpportunityRows } from "~/components/crm";
import { usePeopleCount } from "~/components/orgs/organization-list";
import { PeopleResults } from "~/components/people/people-results";
import { EmptyState, PageHeader, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { requireAdmin } from "~/lib/auth.server";
import { schoolToday } from "~/lib/dates";
import { getOrganization } from "~/lib/organizations.server";

export const meta: Route.MetaFunction = ({ matches, data }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${data?.org.name ?? t("directory.orgs.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  const org = await getOrganization(admin, params.orgId);
  if (!org) throw new Response("Not found", { status: 404 });
  return { org, today: schoolToday() };
}

/** Only http(s) links are rendered as links. */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export default function Organization() {
  const { org, today } = useLoaderData<typeof loader>();
  const { t } = useT();
  const people = usePeopleCount();
  const website = safeHref(org.website);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/organizations">
            <ChevronLeft aria-hidden="true" />
            {t("directory.orgs.back")}
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow={t(`common.orgKind.${org.kind}`)}
        title={org.name}
        description={
          <>
            <span className="font-medium text-graphite">{people(org.people_count)}</span>
            {org.people_count > 0 && <> · {t("directory.orgs.visibleCount", { count: org.visible_count })}</>}
          </>
        }
        actions={
          <>
            {website && (
              <Button asChild variant="ghost">
                <a href={website} target="_blank" rel="noreferrer noopener">
                  <Globe aria-hidden="true" />
                  {t("directory.orgs.website")}
                </a>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to={`/app/people/new?org=${encodeURIComponent(org.name)}`}>
                <Plus aria-hidden="true" />
                {t("directory.orgs.addPerson")}
              </Link>
            </Button>
          </>
        }
      />

      {org.notes && (
        <Panel title={t("directory.orgs.notes")}>
          <p className="text-sm whitespace-pre-line text-graphite">{org.notes}</p>
        </Panel>
      )}

      <section aria-labelledby="org-people" className="grid gap-3">
        <h2 id="org-people" className="text-section">
          {t("directory.orgs.people")}
        </h2>
        {org.people.length ? (
          <PeopleResults people={org.people} savedIds={org.savedIds} isAdmin />
        ) : (
          <EmptyState title={t("directory.orgs.noPeople")} />
        )}
      </section>

      <Panel title={t("directory.orgs.opportunities")}>
        {org.opportunities.length ? (
          <OpportunityRows items={org.opportunities} today={today} showPerson />
        ) : (
          <p className="text-sm text-smoke">{t("directory.orgs.noOpportunities")}</p>
        )}
      </Panel>
    </div>
  );
}

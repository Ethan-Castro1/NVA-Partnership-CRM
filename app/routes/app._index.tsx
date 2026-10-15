/** The staff home: a greeting, the "Ask the village" box, village numbers, my CAPs and what's new. */
import { Link, useLoaderData } from "react-router";
import { UserPlus } from "lucide-react";
import type { Route } from "./+types/app._index";
import { AskCard } from "~/components/dashboard/ask-card";
import { longToday } from "~/components/dashboard/format";
import { MyCaps, RecentActivity, SignupsCallout, StatRow } from "~/components/dashboard/panels";
import { PeopleDataTable } from "~/components/dashboard/people-table/data-table";
import type { DashboardPerson } from "~/components/dashboard/people-table/features";
import type { DashboardCap, RecentEngagement } from "~/components/dashboard/types";
import { PageHeader } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { getLocale } from "~/i18n/locale.server";
import { requireUser } from "~/lib/auth.server";
import { listCaps } from "~/lib/caps.server";
import { query } from "~/lib/db.server";
import { getCounts } from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("dashboard.title")} | ${t("common.schoolName")}` }];
};

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const locale = await getLocale(request, user.locale);

  const [counts, caps, people, recentActivity] = await Promise.all([
    getCounts(),
    listCaps({ ownerId: user.id }),
    // The table filters, sorts and pages in the browser; 1000 rows is plenty for one school.
    query<Omit<DashboardPerson, "updated_at"> & { updated_at: unknown }>(
      `SELECT p.id, p.full_name, p.title, o.name AS organization_name, p.email, p.contribution_types, p.skills,
              p.affiliations, p.status, p.preferred_language, p.updated_at
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        ORDER BY p.updated_at DESC, p.full_name
        LIMIT 1000`,
    ),
    query<RecentEngagement>(
      `SELECT e.id, e.kind, e.happened_on::text AS happened_on, p.id AS person_id, p.full_name AS person_name,
              u.name AS user_name, e.cap_id, c.title AS cap_title
         FROM engagements e
         JOIN people p ON p.id = e.person_id
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN caps c ON c.id = e.cap_id
        ORDER BY e.happened_on DESC, e.created_at DESC
        LIMIT 6`,
    ),
  ]);

  const myCaps: DashboardCap[] = caps.slice(0, 5).map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    term: c.term,
    topics: c.topics,
    partner_count: Number(c.partner_count),
    confirmed_count: Number(c.confirmed_count),
  }));

  return {
    firstName: user.name.trim().split(/\s+/)[0] || user.name,
    isAdmin: user.role === "admin",
    // Formatted here so the server and browser show the same date.
    today: longToday(locale),
    counts,
    myCaps,
    people: people.map((p) => ({ ...p, updated_at: iso(p.updated_at) })) as DashboardPerson[],
    recentActivity,
  };
}

export default function Dashboard() {
  const { firstName, isAdmin, today, counts, myCaps, people, recentActivity } = useLoaderData<typeof loader>();
  const { t } = useT();

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={today}
        title={t("dashboard.greeting", { name: firstName })}
        description={t("dashboard.subtitle")}
        actions={
          isAdmin && (
            <Button asChild variant="brand">
              <Link to="/app/people/new">
                <UserPlus aria-hidden="true" />
                {t("people.new.title")}
              </Link>
            </Button>
          )
        }
      />

      {isAdmin && counts.newSignups > 0 && <SignupsCallout count={counts.newSignups} />}

      <AskCard />

      <StatRow people={counts.people} active={counts.active} leads={counts.leads} byContribution={counts.byContribution} />

      <PeopleDataTable data={people} />

      <div className="grid gap-6 lg:grid-cols-2">
        <MyCaps caps={myCaps} />
        <RecentActivity items={recentActivity} />
      </div>
    </div>
  );
}

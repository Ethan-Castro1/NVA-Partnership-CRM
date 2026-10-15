/** The staff home: a greeting, the "Ask the village" box, village numbers, my CAPs and what's new. */
import { useLoaderData } from "react-router";
import type { Route } from "./+types/app._index";
import { AskCard } from "~/components/dashboard/ask-card";
import { longToday } from "~/components/dashboard/format";
import { MyCaps, RecentActivity, RecentPeople, SignupsCallout, StatRow } from "~/components/dashboard/panels";
import type { DashboardCap, RecentEngagement, RecentPerson } from "~/components/dashboard/types";
import { PageHeader } from "~/components/nva";
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

  const [counts, caps, recentPeople, recentActivity] = await Promise.all([
    getCounts(),
    listCaps({ ownerId: user.id }),
    query<Omit<RecentPerson, "created_at"> & { created_at: unknown }>(
      `SELECT p.id, p.full_name, p.title, o.name AS organization_name, p.contribution_types, p.status, p.created_at
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE p.status <> 'inactive'
        ORDER BY p.created_at DESC, p.full_name
        LIMIT 6`,
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
    recentPeople: recentPeople.map((p) => ({ ...p, created_at: iso(p.created_at) })) as RecentPerson[],
    recentActivity,
  };
}

export default function Dashboard() {
  const { firstName, isAdmin, today, counts, myCaps, recentPeople, recentActivity } = useLoaderData<typeof loader>();
  const { t } = useT();

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow={today} title={t("dashboard.greeting", { name: firstName })} description={t("dashboard.subtitle")} />

      {isAdmin && counts.newSignups > 0 && <SignupsCallout count={counts.newSignups} />}

      <AskCard />

      <StatRow people={counts.people} active={counts.active} leads={counts.leads} byContribution={counts.byContribution} />

      <RecentPeople people={recentPeople} />

      <div className="grid gap-6 lg:grid-cols-2">
        <MyCaps caps={myCaps} />
        <RecentActivity items={recentActivity} />
      </div>
    </div>
  );
}

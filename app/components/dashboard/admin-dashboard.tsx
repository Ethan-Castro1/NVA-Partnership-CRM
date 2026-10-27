/** The administrator's dashboard: what to act on today, in one calm page. */
import { Link } from "react-router";
import { AlarmClock, CalendarClock, ClipboardList, Hourglass, Mail, PenLine, Workflow, Users } from "lucide-react";
import { FollowUpList, StageBadge } from "~/components/crm";
import { ContributionChips, PageHeader, Panel, PersonAvatar, StatTile } from "~/components/nva";
import { RequestRows } from "~/components/requests";
import { useT } from "~/i18n";
import type { AdminDashboard as AdminData, DashboardActivity } from "~/lib/dashboard.server";
import type { OpportunityTrack } from "~/lib/constants";
import { cn } from "~/lib/utils";
import { shortDate } from "./format";
import { NeedSearch, UpcomingEngagements, ViewAll, linkClass } from "./panels";
import { QuickActions } from "./quick-actions";

export function AdminDashboard({
  data,
  firstName,
  todayLabel,
  userId,
}: {
  data: AdminData;
  firstName: string;
  todayLabel: string;
  userId: string;
}) {
  const { t, locale } = useT();
  const { followUpCounts: fu, attention } = data;

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow={todayLabel} title={t("dashboard.greeting", { name: firstName })} description={t("dashboard.admin.description")} />

      <QuickActions today={data.today} people={data.people} owners={data.owners} defaultOwnerId={userId} />

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          {t("dashboard.statsHeading")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <li>
            <StatTile label={t("dashboard.stat.overdue")} value={fu.overdue} icon={<AlarmClock />} accent={fu.overdue ? "skills_lesson" : "gold"} to="/app/follow-ups?view=overdue" />
          </li>
          <li>
            <StatTile label={t("dashboard.stat.today")} value={fu.today} icon={<CalendarClock />} to="/app/follow-ups?view=today" />
          </li>
          <li>
            <StatTile label={t("dashboard.stat.awaiting")} value={fu.awaiting} icon={<Hourglass />} to="/app/follow-ups?view=awaiting" />
          </li>
          <li>
            <StatTile label={t("dashboard.stat.requests")} value={attention.open} icon={<ClipboardList />} to="/app/admin/requests" />
          </li>
          <li className="col-span-2 md:col-span-1">
            <StatTile label={t("dashboard.stat.signups")} value={data.signupCount} icon={<Users />} to="/app/admin/intake" />
          </li>
        </ul>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-6">
          <Panel title={t("dashboard.fu.title")} action={<ViewAll to="/app/follow-ups" />}>
            <h3 className="text-eyebrow text-smoke">{t("dashboard.fu.dueNow")}</h3>
            <FollowUpList items={data.dueNow} today={data.today} empty={t("dashboard.fu.emptyDue")} className="mt-1" />
            <h3 className="mt-5 text-eyebrow text-smoke">{t("dashboard.fu.upcoming")}</h3>
            <FollowUpList items={data.upcoming} today={data.today} empty={t("dashboard.fu.emptyUpcoming")} className="mt-1" />
          </Panel>

          <Panel title={t("dashboard.awaiting.title")} action={fu.awaiting > 0 && <ViewAll to="/app/follow-ups?view=awaiting" />}>
            <FollowUpList items={data.awaiting} today={data.today} empty={t("dashboard.awaiting.empty")} />
          </Panel>

          <Panel title={t("dashboard.activity.title")} action={<ViewAll to="/app/communications" />}>
            {data.activity.length === 0 ? (
              <p className="py-2 text-sm text-smoke">{t("dashboard.activity.empty")}</p>
            ) : (
              <ul className="divide-y divide-stone">
                {data.activity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 gap-6">
          <Panel
            title={t("dashboard.requests.title")}
            action={attention.open > 0 && <ViewAll to="/app/admin/requests" />}
          >
            {attention.introductions > 0 && (
              <p className="-mt-1 mb-3 text-sm font-medium text-gold-ink">
                {attention.introductions === 1
                  ? t("dashboard.requests.introsOne")
                  : t("dashboard.requests.intros", { count: attention.introductions })}
              </p>
            )}
            {attention.items.length === 0 ? (
              <p className="py-2 text-sm text-smoke">{t("dashboard.requests.empty")}</p>
            ) : (
              <RequestRows requests={attention.items} showRequester />
            )}
          </Panel>

          <Panel title={t("dashboard.signups.title")} action={data.signupCount > 0 && <ViewAll to="/app/admin/intake" />}>
            {data.signups.length === 0 ? (
              <p className="py-2 text-sm text-smoke">{t("dashboard.signups.empty")}</p>
            ) : (
              <ul className="divide-y divide-stone">
                {data.signups.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <PersonAvatar name={s.full_name || "?"} className="size-8" />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <Link to={`/app/admin/intake/${s.id}`} className={linkClass}>
                        {s.full_name || t("dashboard.signups.review")}
                      </Link>
                      <ContributionChips types={s.contribution_types} />
                    </div>
                    <time dateTime={s.submitted_at} className="shrink-0 text-xs text-smoke">
                      {shortDate(s.submitted_at, locale)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <UpcomingEngagements items={data.engagements} showRequester />

          <Panel title={t("dashboard.opps.title")} action={<ViewAll to="/app/opportunities" />}>
            {data.stages.length === 0 ? (
              <p className="py-2 text-sm text-smoke">{t("dashboard.opps.empty")}</p>
            ) : (
              <div className="grid gap-4">
                {(["engagement", "funding"] as OpportunityTrack[]).map((track) => {
                  const rows = data.stages.filter((s) => s.track === track);
                  if (!rows.length) return null;
                  return (
                    <div key={track} className="grid gap-2">
                      <h3 className="flex items-center gap-2 text-eyebrow text-smoke">
                        <Workflow className="size-3.5" aria-hidden="true" />
                        {t(`common.track.${track}`)}
                      </h3>
                      <ul className="flex flex-wrap gap-2">
                        {rows.map((s) => (
                          <li key={s.stage}>
                            <Link
                              to={`/app/opportunities?track=${track}&stage=${s.stage}`}
                              className="inline-flex items-center gap-1.5 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                            >
                              <StageBadge stage={s.stage} className="hover:border-gold" />
                              <span className="text-sm font-semibold tabular-nums">{s.count}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <NeedSearch />
        </div>
      </div>
    </div>
  );
}

const ORIGIN_STYLE: Record<DashboardActivity["origin"], string> = {
  email: "border-blue/40 bg-blue-soft text-blue-ink",
  manual: "border-stone bg-canvas text-graphite",
  system: "border-transparent bg-taupe text-smoke",
  staff_request: "border-transparent bg-sage-soft text-sage-ink",
};

/** One history row. Email activity carries a blue "From email" tag; manual entries say "Added by hand". */
function ActivityRow({ item }: { item: DashboardActivity }) {
  const { t, locale } = useT();
  const Icon = item.origin === "email" ? Mail : PenLine;
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <PersonAvatar name={item.person_name} className="size-8" />
      <div className="grid min-w-0 flex-1 gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={`/app/people/${item.person_id}`} className={linkClass}>
            {item.person_name}
          </Link>
          <span className="text-graphite">{t(`common.engagement.${item.kind}`)}</span>
        </div>
        {item.summary && <p className="line-clamp-2 text-xs text-smoke">{item.summary}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-smoke">
          <span
            className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[0.7rem] font-medium", ORIGIN_STYLE[item.origin])}
          >
            {(item.origin === "email" || item.origin === "manual") && <Icon className="size-3" aria-hidden="true" />}
            {t(`common.historyOrigin.${item.origin}`)}
          </span>
          {item.user_name && <span>{t("dashboard.activity.by", { name: item.user_name })}</span>}
        </div>
      </div>
      <time dateTime={item.happened_on} className="shrink-0 text-xs text-smoke">
        {shortDate(item.happened_on, locale)}
      </time>
    </li>
  );
}

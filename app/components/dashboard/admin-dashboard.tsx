/** The administrator's dashboard: what to act on today, in one calm page. */
import { Link } from "react-router";
import { Mail, Workflow } from "lucide-react";
import { StageBadge } from "~/components/crm";
import { ContributionChips, PageHeader, Panel, PersonAvatar } from "~/components/nva";
import { RequestRows } from "~/components/requests";
import { useT } from "~/i18n";
import type { AdminDashboard as AdminData, DashboardActivity } from "~/lib/dashboard.server";
import type { OpportunityTrack } from "~/lib/constants";
import { cn } from "~/lib/utils";
import { DashboardFollowUps } from "./follow-up-rows";
import { shortDate } from "./format";
import { MOBILE_LIMIT, UpcomingEngagements, ViewAll, linkClass } from "./panels";
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
  const { attention } = data;

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={todayLabel}
        title={t("dashboard.greeting", { name: firstName })}
        actions={<QuickActions today={data.today} people={data.people} owners={data.owners} defaultOwnerId={userId} />}
      />

      {/*
        Two columns on wide screens. On narrow ones the column wrappers dissolve
        ("contents") so the panels stack in this order: follow-ups, staff requests,
        sign-ups, activity, engagements, opportunities.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="contents lg:grid lg:min-w-0 lg:gap-6">
          <Panel title={t("dashboard.fu.title")} action={<ViewAll to="/app/follow-ups" />} className="order-1 min-w-0">
            <DashboardFollowUps
              today={data.today}
              empty={t("dashboard.fu.empty")}
              groups={[
                { key: "due", label: t("dashboard.fu.dueNow"), items: data.dueNow },
                { key: "upcoming", label: t("dashboard.fu.upcoming"), items: data.upcoming },
                { key: "awaiting", label: t("dashboard.fu.awaiting"), items: data.awaiting },
              ]}
            />
          </Panel>

          <Panel title={t("dashboard.activity.title")} action={<ViewAll to="/app/communications" />} className="order-4 min-w-0">
            {data.activity.length === 0 ? (
              <p className="py-2 text-sm text-smoke">{t("dashboard.activity.empty")}</p>
            ) : (
              <ul className={cn("divide-y divide-stone", MOBILE_LIMIT)}>
                {data.activity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="contents lg:grid lg:min-w-0 lg:gap-6">
          <Panel
            title={t("dashboard.requests.title")}
            action={attention.open > 0 && <ViewAll to="/app/admin/requests" />}
            className="order-2 min-w-0"
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
              <RequestRows requests={attention.items} showRequester className={MOBILE_LIMIT} />
            )}
          </Panel>

          <Panel
            title={t("dashboard.signups.title")}
            action={data.signupCount > 0 && <ViewAll to="/app/admin/intake" />}
            className="order-3 min-w-0"
          >
            {data.signups.length === 0 ? (
              <p className="py-2 text-sm text-smoke">{t("dashboard.signups.empty")}</p>
            ) : (
              <ul className={cn("divide-y divide-stone", MOBILE_LIMIT)}>
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

          <UpcomingEngagements items={data.engagements} showRequester className="order-5 min-w-0" />

          <Panel title={t("dashboard.opps.title")} action={<ViewAll to="/app/opportunities" />} className="order-6 min-w-0">
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
        </div>
      </div>
    </div>
  );
}

/** One history row: who and what, a one-line note, and a small "From email" badge for email. */
function ActivityRow({ item }: { item: DashboardActivity }) {
  const { t, locale } = useT();
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <PersonAvatar name={item.person_name} className="size-8" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={`/app/people/${item.person_id}`} className={linkClass}>
            {item.person_name}
          </Link>
          <span className="text-graphite">{t(`common.engagement.${item.kind}`)}</span>
          {item.origin === "email" && (
            <span className="inline-flex h-5 items-center gap-1 rounded-full border border-blue/40 bg-blue-soft px-2 text-[0.7rem] font-medium text-blue-ink">
              <Mail className="size-3" aria-hidden="true" />
              {t("common.historyOrigin.email")}
            </span>
          )}
        </div>
        {item.summary && <p className="mt-0.5 truncate text-xs text-smoke">{item.summary}</p>}
      </div>
      <time dateTime={item.happened_on} className="shrink-0 text-xs text-smoke">
        {shortDate(item.happened_on, locale)}
      </time>
    </li>
  );
}

/** The dashboard's sections: stat row, my CAPs, recently added people and recent activity. */
import { Link } from "react-router";
import { ArrowRight, ClipboardList, FolderKanban, Plus, UserCheck, UserPlus, Users } from "lucide-react";
import {
  ContributionChips,
  EmptyState,
  Panel,
  PersonAvatar,
  StatTile,
  StatusBadge,
} from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useT } from "~/i18n";
import type { CapStatus } from "~/lib/constants";
import { cn } from "~/lib/utils";
import { shortDate } from "./format";
import type { DashboardCap, RecentEngagement, RecentPerson } from "./types";

const linkClass =
  "rounded-sm font-medium text-ink hover:underline hover:decoration-gold hover:decoration-2 hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

function ViewAll({ to }: { to: string }) {
  const { t } = useT();
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={to}>
        {t("common.action.viewAll")}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

const roleLine = (p: { title: string | null; organization_name: string | null }) =>
  [p.title, p.organization_name].filter(Boolean).join(", ");

// ---------- stats ----------

export function StatRow({
  people,
  leads,
  active,
  isAdmin,
  newSignups,
  myCaps,
}: {
  people: number;
  leads: number;
  active: number;
  isAdmin: boolean;
  newSignups: number;
  myCaps: number;
}) {
  const { t } = useT();
  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="sr-only">
        {t("dashboard.statsHeading")}
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <li>
          <StatTile label={t("dashboard.statPeople")} value={people} icon={<Users aria-hidden="true" />} to="/app/people" />
        </li>
        <li>
          <StatTile
            label={t("dashboard.statLeads")}
            value={leads}
            icon={<UserPlus aria-hidden="true" />}
            to="/app/people?status=lead"
          />
        </li>
        <li>
          <StatTile
            label={t("dashboard.statActive")}
            value={active}
            icon={<UserCheck aria-hidden="true" />}
            to="/app/people?status=active"
          />
        </li>
        <li>
          {isAdmin ? (
            <StatTile
              label={t("dashboard.statSignups")}
              value={newSignups}
              icon={<ClipboardList aria-hidden="true" />}
              to="/app/admin/intake"
            />
          ) : (
            <StatTile
              label={t("dashboard.statMyCaps")}
              value={myCaps}
              icon={<FolderKanban aria-hidden="true" />}
              to="/app/caps?show=mine"
            />
          )}
        </li>
      </ul>
    </section>
  );
}

// ---------- admin callout ----------

export function SignupsCallout({ count }: { count: number }) {
  const { t } = useT();
  return (
    <section
      aria-labelledby="signups-heading"
      className="flex flex-col gap-3 rounded-card border border-gold/60 bg-gold-soft p-4 sm:flex-row sm:items-center md:p-5"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold text-ink" aria-hidden="true">
        <Users className="size-5" />
      </span>
      <div className="flex-1">
        <h2 id="signups-heading" className="font-semibold text-ink">
          {count === 1 ? t("dashboard.signupsTitleOne") : t("dashboard.signupsTitle", { count })}
        </h2>
      </div>
      <Button asChild variant="outline">
        <Link to="/app/admin/intake">
          {t("dashboard.signupsAction")}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

// ---------- my CAPs ----------

const CAP_STATUS_STYLE: Record<CapStatus, string> = {
  planning: "bg-gold-soft text-gold-ink",
  active: "bg-sage-soft text-sage-ink",
  complete: "bg-stone text-smoke",
};

export function CapStatusPill({ status }: { status: CapStatus }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", CAP_STATUS_STYLE[status])}>
      {t(`common.capStatus.${status}`)}
    </span>
  );
}

export function MyCaps({ caps }: { caps: DashboardCap[] }) {
  const { t } = useT();
  return (
    <Panel title={t("dashboard.myCaps")} action={caps.length > 0 && <ViewAll to="/app/caps" />}>
      {caps.length === 0 ? (
        <EmptyState
          title={t("dashboard.myCapsEmptyTitle")}
          body={t("dashboard.myCapsEmptyBody")}
          action={
            <Button asChild>
              <Link to="/app/caps/new">
                <Plus aria-hidden="true" />
                {t("caps.list.new")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-2">
          {caps.map((cap) => (
            <li key={cap.id} className="rounded-2xl border border-stone bg-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link to={`/app/caps/${cap.id}`} className={cn(linkClass, "min-w-0 flex-1")}>
                  {cap.title}
                </Link>
                <CapStatusPill status={cap.status} />
              </div>
              <p className="mt-1 text-sm text-smoke">
                {cap.topics.length ? cap.topics.slice(0, 3).join(", ") : t("dashboard.capNoTopics")}
                {cap.term ? ` (${cap.term})` : ""}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-graphite">
                <span>{t("dashboard.capPartners", { count: cap.partner_count })}</span>
                <span>{t("dashboard.capConfirmed", { count: cap.confirmed_count })}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------- recently added ----------

export function RecentPeople({ people }: { people: RecentPerson[] }) {
  const { t, locale } = useT();
  return (
    <Panel title={t("dashboard.recentPeople")} action={people.length > 0 && <ViewAll to="/app/people" />}>
      {people.length === 0 ? (
        <EmptyState title={t("dashboard.recentPeopleEmpty")} />
      ) : (
        <>
          {/* Wide screens: a clean CRM table. */}
          <div className="hidden rounded-2xl bg-canvas px-2 md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-stone hover:bg-transparent">
                  <TableHead className="text-smoke">{t("dashboard.colName")}</TableHead>
                  <TableHead className="text-smoke">{t("common.field.contributions")}</TableHead>
                  <TableHead className="text-smoke">{t("common.field.status")}</TableHead>
                  <TableHead className="text-right text-smoke">{t("dashboard.colAdded")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.id} className="border-stone">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <PersonAvatar name={p.full_name} />
                        <div className="min-w-0">
                          <Link to={`/app/people/${p.id}`} className={linkClass}>
                            {p.full_name}
                          </Link>
                          {roleLine(p) && <p className="truncate text-xs text-smoke">{roleLine(p)}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ContributionChips types={p.contribution_types} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-smoke">{shortDate(p.created_at, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Phones: stacked cards. */}
          <ul className="grid gap-2 md:hidden">
            {people.map((p) => (
              <li key={p.id} className="grid gap-2 rounded-2xl border border-stone bg-canvas p-3.5">
                <div className="flex items-start gap-3">
                  <PersonAvatar name={p.full_name} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/people/${p.id}`} className={linkClass}>
                      {p.full_name}
                    </Link>
                    {roleLine(p) && <p className="text-xs text-smoke">{roleLine(p)}</p>}
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <ContributionChips types={p.contribution_types} />
                <p className="text-xs text-smoke">
                  {t("dashboard.colAdded")}: {shortDate(p.created_at, locale)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ---------- recent activity ----------

export function RecentActivity({ items }: { items: RecentEngagement[] }) {
  const { t, locale } = useT();
  return (
    <Panel title={t("dashboard.recentActivity")}>
      {items.length === 0 ? (
        <EmptyState title={t("dashboard.activityEmpty")} />
      ) : (
        <ul className="grid gap-2">
          {items.map((e) => (
            <li key={e.id} className="flex items-start gap-3 rounded-2xl border border-stone bg-canvas p-3.5">
              <PersonAvatar name={e.person_name} className="size-8" />
              <div className="min-w-0 flex-1 text-sm">
                <Link to={`/app/people/${e.person_id}`} className={linkClass}>
                  {e.person_name}
                </Link>
                <p className="text-xs text-smoke">
                  {[
                    t(`common.engagement.${e.kind}`),
                    e.cap_title ? t("dashboard.activityForCap", { cap: e.cap_title }) : null,
                    e.user_name ? t("dashboard.activityBy", { name: e.user_name }) : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <time dateTime={e.happened_on} className="shrink-0 text-xs text-smoke">
                {shortDate(e.happened_on, locale)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

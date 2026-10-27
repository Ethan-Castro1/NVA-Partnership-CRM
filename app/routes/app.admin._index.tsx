/** Admin "Needs attention": new sign-ups, leads to contact and CAPs still looking for a partner. */
import { Link, useLoaderData } from "react-router";
import { ArrowRight, ClipboardList, Download, FolderKanban, HeartHandshake, UserPlus, Users } from "lucide-react";
import type { Route } from "./+types/app.admin._index";
import { CapStatusBadge } from "~/components/caps/cap-bits";
import { RelativeTime, formatDate, formatDay } from "~/components/admin/format";
import {
  ContributionChips,
  EmptyState,
  PageHeader,
  Panel,
  PersonAvatar,
  Sheet,
  StatTile,
  StatusBadge,
} from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { makeT, useT } from "~/i18n";
import { getAdminOverview } from "~/lib/admin.server";
import { requireAdmin } from "~/lib/auth.server";
import { CONTRIBUTION_COLOR, CONTRIBUTION_TYPES } from "~/lib/constants";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("admin.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  return getAdminOverview(admin);
}

export default function AdminOverview() {
  const { counts, signups, leads, capsWithoutPartner, recent } = useLoaderData<typeof loader>();
  const { t, locale } = useT();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("admin.eyebrow")}
        title={t("admin.title")}
        description={t("admin.description")}
        actions={
          <Button variant="outline" asChild>
            {/* reloadDocument: a file download, not a client-side navigation. */}
            <Link to="/app/admin/export.csv" reloadDocument>
              <Download aria-hidden="true" />
              {t("common.action.export")}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label={t("admin.stat.people")} value={counts.people} hint={t("admin.stat.peopleHint")} icon={<Users />} to="/app/people" />
        <StatTile
          label={t("admin.stat.active")}
          value={counts.active}
          hint={t("admin.stat.activeHint")}
          icon={<HeartHandshake />}
          accent="cap_partner"
          to="/app/people?status=active"
        />
        <StatTile
          label={t("admin.stat.newSignups")}
          value={counts.newSignups}
          hint={t("admin.stat.newSignupsHint")}
          icon={<ClipboardList />}
          to="/app/admin/intake"
        />
        <StatTile
          label={t("admin.stat.leads")}
          value={counts.leads}
          hint={t("admin.stat.leadsHint")}
          icon={<UserPlus />}
          accent="internship"
          to="/app/people?status=lead"
        />
        <StatTile
          label={t("admin.stat.activeCaps")}
          value={counts.activeCaps}
          hint={t("admin.stat.activeCapsHint")}
          icon={<FolderKanban />}
          accent="classroom_volunteer"
          to="/app/caps"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={t("admin.signups.title")}
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/admin/intake">
                {t("admin.signups.reviewAll")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          {signups.length ? (
            <Sheet className="p-2">
              <ul className="divide-y divide-stone">
                {signups.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/app/admin/intake/${s.id}`}
                      className="flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-taupe focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <PersonAvatar name={s.full_name} />
                      <span className="grid min-w-0 flex-1 gap-1.5">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="truncate font-medium">{s.full_name}</span>
                          <RelativeTime iso={s.submitted_at} className="text-xs text-smoke" />
                        </span>
                        <ContributionChips types={s.contribution_types} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Sheet>
          ) : (
            <EmptyState title={t("admin.signups.empty")} />
          )}
        </Panel>

        <Panel
          title={t("admin.leads.title")}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/people?status=lead">
                {t("common.action.viewAll")}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          {leads.length ? (
            <Sheet className="p-2">
              <ul className="divide-y divide-stone">
                {leads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-3">
                    <PersonCell id={l.id} name={l.full_name} subtitle={[l.title, l.organization_name].filter(Boolean).join(", ")} />
                    <span className="text-xs text-smoke">
                      {l.last_contact ? t("admin.leads.lastContact", { date: formatDay(l.last_contact, locale) }) : t("admin.leads.never")}
                    </span>
                  </li>
                ))}
              </ul>
            </Sheet>
          ) : (
            <EmptyState title={t("admin.leads.empty")} />
          )}
        </Panel>

        <Panel title={t("admin.capsNoPartner.title")}>
          {capsWithoutPartner.length ? (
            <Sheet className="p-2">
              <ul className="divide-y divide-stone">
                {capsWithoutPartner.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/app/caps/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 hover:bg-taupe focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="grid min-w-0">
                        <span className="truncate font-medium">{c.title}</span>
                        {(c.owner_name || c.term) && (
                          <span className="truncate text-xs text-smoke">{[c.owner_name, c.term].filter(Boolean).join(" · ")}</span>
                        )}
                      </span>
                      <CapStatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Sheet>
          ) : (
            <EmptyState title={t("admin.capsNoPartner.empty")} />
          )}
        </Panel>

        <WaysToHelp byContribution={counts.byContribution} />
      </div>

      <Panel title={t("admin.recent.title")}>
        {recent.length ? (
          <Sheet className="p-0">
            {/* Wide screens: a table. Phones: stacked cards. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">{t("admin.col.name")}</TableHead>
                    <TableHead>{t("common.field.contributions")}</TableHead>
                    <TableHead>{t("common.field.source")}</TableHead>
                    <TableHead>{t("common.field.status")}</TableHead>
                    <TableHead className="pr-5 text-right">{t("admin.col.added")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-5">
                        <PersonCell id={p.id} name={p.full_name} subtitle={[p.title, p.organization_name].filter(Boolean).join(", ")} />
                      </TableCell>
                      <TableCell>
                        <ContributionChips types={p.contribution_types} />
                      </TableCell>
                      <TableCell className="text-smoke">{t(`common.source.${p.source}`)}</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="pr-5 text-right whitespace-nowrap text-smoke">{formatDate(p.created_at, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-stone md:hidden">
              {recent.map((p) => (
                <li key={p.id} className="grid gap-2 p-4">
                  <PersonCell id={p.id} name={p.full_name} subtitle={[p.title, p.organization_name].filter(Boolean).join(", ")} />
                  <ContributionChips types={p.contribution_types} />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-smoke">
                    <StatusBadge status={p.status} />
                    <span>{t(`common.source.${p.source}`)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(p.created_at, locale)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Sheet>
        ) : (
          <EmptyState title={t("admin.recent.empty")} />
        )}
      </Panel>
    </div>
  );
}

function PersonCell({ id, name, subtitle }: { id: string; name: string; subtitle?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={name} />
      <div className="grid min-w-0">
        <Link to={`/app/people/${id}`} className="truncate font-medium hover:underline focus-visible:underline">
          {name}
        </Link>
        {subtitle && <span className="truncate text-xs text-smoke">{subtitle}</span>}
      </div>
    </div>
  );
}

/** Horizontal bars, one per way to help, each in that type's colour. The numbers are text too. */
function WaysToHelp({ byContribution }: { byContribution: Record<string, number> }) {
  const { t } = useT();
  const max = Math.max(1, ...CONTRIBUTION_TYPES.map((type) => byContribution[type] ?? 0));
  const total = CONTRIBUTION_TYPES.reduce((sum, type) => sum + (byContribution[type] ?? 0), 0);

  return (
    <Panel title={t("admin.ways.title")}>
      <p className="-mt-2 mb-4 text-sm text-smoke">{t("admin.ways.description")}</p>
      {total ? (
        <ul className="grid gap-4">
          {CONTRIBUTION_TYPES.map((type) => {
            const n = byContribution[type] ?? 0;
            return (
              <li key={type} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-graphite">
                    <span className={`size-2.5 rounded-full ${CONTRIBUTION_COLOR[type].dot}`} aria-hidden="true" />
                    {t(`common.contribution.${type}`)}
                  </span>
                  <span className="font-medium tabular-nums">
                    {n === 1 ? t("admin.ways.countOne") : t("admin.ways.count", { count: n })}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${(n / max) * 100}%`, backgroundColor: CONTRIBUTION_COLOR[type].hex }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={t("admin.ways.empty")} />
      )}
    </Panel>
  );
}

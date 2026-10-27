/** Sign-ups from the public form, in New / Approved / Rejected / Archived tabs. Admins only. */
import { Link, useLoaderData } from "react-router";
import { ChevronRight } from "lucide-react";
import type { Route } from "./+types/app.admin.intake._index";
import { formatDate } from "~/components/admin/format";
import { DoneNotice } from "~/components/intake/review";
import { ContributionChips, EmptyState, PageHeader, Panel, PersonAvatar, Sheet, StatusBadge } from "~/components/nva";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { makeT, useT } from "~/i18n";
import { decidedIntakeName, listIntake, type SignupRow } from "~/lib/admin.server";
import { INTAKE_STATUSES, type IntakeStatus } from "~/lib/constants";
import { requireAdmin } from "~/lib/auth.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  return [{ title: `${t("admin.intake.title")} | ${t("common.schoolName")}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const requested = new URL(request.url).searchParams.get("status");
  const status: IntakeStatus = INTAKE_STATUSES.find((s) => s === requested) ?? "new";
  const { rows, counts } = await listIntake(status);
  return { status, rows, counts, decidedName: await decidedIntakeName(request) };
}

export default function IntakeList() {
  const { status, rows, counts, decidedName } = useLoaderData<typeof loader>();
  const { t } = useT();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("common.nav.adminSection")} title={t("admin.intake.title")} description={t("admin.intake.description")} />

      <DoneNotice
        name={decidedName}
        fallback={
          <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
            {t("common.state.saved")}
          </p>
        }
      />

      <nav aria-label={t("admin.intake.tabsLabel")}>
        <ul className="inline-flex flex-wrap gap-1 rounded-full bg-taupe p-1">
          {INTAKE_STATUSES.map((s) => {
            const current = s === status;
            return (
              <li key={s}>
                <Link
                  to={s === "new" ? "/app/admin/intake" : `/app/admin/intake?status=${s}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    current ? "bg-canvas font-medium text-ink shadow-whisper" : "text-graphite hover:bg-canvas/60",
                  )}
                >
                  {t(`admin.intake.tab.${s}`)}
                  <span
                    className={cn(
                      "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-bold tabular-nums",
                      current && s === "new" ? "bg-gold text-ink" : "bg-stone text-graphite",
                    )}
                  >
                    {counts[s]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Panel>
        {rows.length ? (
          <Sheet className="p-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">{t("admin.col.name")}</TableHead>
                    <TableHead>{t("admin.col.submitted")}</TableHead>
                    <TableHead>{t("admin.col.language")}</TableHead>
                    <TableHead>{t("common.field.contributions")}</TableHead>
                    <TableHead className="text-right">{t("admin.col.referrals")}</TableHead>
                    <TableHead>{t("admin.intake.col.crm")}</TableHead>
                    <TableHead className="pr-5">
                      <span className="sr-only">{t("admin.col.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="pl-5">
                        <NameCell row={row} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-smoke">
                        <SubmittedDate iso={row.submitted_at} />
                      </TableCell>
                      <TableCell className="text-smoke">{t(`common.language.${row.preferred_language}`)}</TableCell>
                      <TableCell>
                        <ContributionChips types={row.contribution_types} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.referral_count}</TableCell>
                      <TableCell>
                        <ProfileStatus row={row} />
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <Link
                          to={`/app/admin/intake/${row.id}`}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium hover:bg-taupe focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          aria-label={`${t("admin.intake.open")}: ${row.full_name}`}
                        >
                          {t("admin.intake.open")}
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-stone md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="grid gap-2.5 p-4">
                  <NameCell row={row} />
                  <ContributionChips types={row.contribution_types} />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-smoke">
                    <ProfileStatus row={row} />
                    <SubmittedDate iso={row.submitted_at} />
                    <span aria-hidden="true">·</span>
                    <span>{t(`common.language.${row.preferred_language}`)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {row.referral_count === 1
                        ? t("admin.intake.referralCountOne")
                        : t("admin.intake.referralCount", { count: row.referral_count })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Sheet>
        ) : (
          <EmptyState title={t(`admin.intake.empty.${status}`)} />
        )}
      </Panel>
    </div>
  );
}

function NameCell({ row }: { row: SignupRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={row.full_name} />
      <div className="grid min-w-0">
        <Link to={`/app/admin/intake/${row.id}`} className="truncate font-medium hover:underline focus-visible:underline">
          {row.full_name}
        </Link>
        {row.email && <span className="truncate text-xs text-smoke">{row.email}</span>}
      </div>
    </div>
  );
}

function SubmittedDate({ iso }: { iso: string }) {
  const { locale } = useT();
  return <time dateTime={iso}>{formatDate(iso, locale)}</time>;
}

function ProfileStatus({ row }: { row: SignupRow }) {
  const { t } = useT();
  if (row.possible_match)
    return (
      <span
        title={t("admin.intake.possibleMatchHint")}
        className="inline-flex h-5 cursor-help items-center rounded-full bg-gold-soft px-2 text-[0.7rem] font-medium text-gold-ink"
      >
        {t("admin.intake.possibleMatch")}
      </span>
    );
  return row.person_status ? <StatusBadge status={row.person_status} /> : <span className="text-xs text-smoke">{t("admin.intake.noProfile")}</span>;
}

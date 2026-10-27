/** Sign-ups from the public form, in New / Approved / Rejected / Archived tabs. Admins only. */
import { Link, useLoaderData } from "react-router";
import { ChevronRight } from "lucide-react";
import type { Route } from "./+types/app.admin.intake._index";
import { formatDate } from "~/components/admin/format";
import { DoneNotice } from "~/components/intake/review";
import { SegmentedLinks } from "~/components/crm/crm-bits";
import { PageHeader, PersonAvatar, Sheet } from "~/components/nva";
import { makeT, useT } from "~/i18n";
import { decidedIntakeName, listIntake } from "~/lib/admin.server";
import { CONTRIBUTION_TYPES, INTAKE_STATUSES, type IntakeStatus } from "~/lib/constants";
import { requireAdmin } from "~/lib/auth.server";

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
  const { t, locale } = useT();

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={t("admin.intake.title")} />

      <DoneNotice
        name={decidedName}
        fallback={
          <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
            {t("common.state.saved")}
          </p>
        }
      />

      <SegmentedLinks
        label={t("admin.intake.tabsLabel")}
        tabs={INTAKE_STATUSES.map((s) => ({
          to: s === "new" ? "/app/admin/intake" : `/app/admin/intake?status=${s}`,
          label: t(`admin.intake.tab.${s}`),
          current: s === status,
          count: counts[s],
        }))}
      />

      {rows.length ? (
        <Sheet className="px-4 py-1 md:px-5">
          <ul className="divide-y divide-stone">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <PersonAvatar name={row.full_name} className="hidden sm:flex" />
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/app/admin/intake/${row.id}`} className="min-w-0 truncate font-medium underline-offset-4 hover:underline">
                      {row.full_name}
                    </Link>
                    {row.possible_match && (
                      <span
                        title={t("admin.intake.possibleMatchHint")}
                        className="inline-flex h-5 shrink-0 cursor-help items-center rounded-full bg-gold-soft px-2 text-[0.7rem] font-medium text-gold-ink"
                      >
                        {t("admin.intake.possibleMatch")}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-smoke">
                    {[
                      CONTRIBUTION_TYPES.filter((c) => row.contribution_types.includes(c))
                        .map((c) => t(`common.contribution.${c}`))
                        .join(", "),
                      formatDate(row.submitted_at, locale),
                      row.preferred_language !== "en" ? t(`common.language.${row.preferred_language}`) : null,
                      row.referral_count === 1
                        ? t("admin.intake.referralCountOne")
                        : row.referral_count > 1
                          ? t("admin.intake.referralCount", { count: row.referral_count })
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <ChevronRight className="hidden size-4 shrink-0 text-ash sm:block" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </Sheet>
      ) : (
        <p className="text-sm text-smoke">{t(`admin.intake.empty.${status}`)}</p>
      )}
    </div>
  );
}

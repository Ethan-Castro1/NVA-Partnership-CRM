/** One sign-up, shown in full. Decide at the top, then move on to the next one. */
import { TopicList } from "~/components/caps/cap-bits";
import { data, Link, redirect, useFetcher, useLoaderData, useSearchParams } from "react-router";
import type { ReactNode } from "react";
import { Archive, ArrowLeft, Check, CheckCircle2, ExternalLink, Pencil, RotateCcw, UserRound } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.admin.intake.$submissionId";
import { IntakeStatusBadge, formatDate, formatDateTime } from "~/components/admin/format";
import {
  ContributionChip,
  ContributionChips,
  EmptyState,
  PageHeader,
  Panel,
  PersonAvatar,
  Sheet,
  StatusBadge,
  TagList,
} from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT } from "~/i18n";
import { getIntakeSubmission, nextNewIntake, setIntakeStatus, type IntakeDetail, type MatchedPerson } from "~/lib/admin.server";
import { requireAdmin } from "~/lib/auth.server";

export const meta: Route.MetaFunction = ({ matches, data: loaderData }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const name = (loaderData as { submission?: IntakeDetail } | undefined)?.submission?.payload.full_name;
  return [{ title: `${name ? `${name} | ` : ""}${t("admin.detail.eyebrow")} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const submission = await getIntakeSubmission(params.submissionId);
  if (!submission) throw new Response("Not found", { status: 404 });
  return { submission };
}

const ActionSchema = z.object({
  intent: z.enum(["reviewed", "archived", "new"]),
  activate: z.literal("on").optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const parsed = ActionSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return data({ ok: false as const, error: "admin.error.invalid" as const }, { status: 400 });
  const found = await setIntakeStatus(params.submissionId, parsed.data.intent, user.id, {
    activatePerson: parsed.data.activate === "on",
  });
  if (!found) return data({ ok: false as const, error: "admin.error.signupNotFound" as const }, { status: 404 });
  // Reviewing or archiving is only offered on new sign-ups: go straight to the next one.
  if (parsed.data.intent !== "new") {
    const next = await nextNewIntake(params.submissionId);
    return redirect(next ? `/app/admin/intake/${next}?done=1` : "/app/admin/intake?done=1");
  }
  return { ok: true as const, done: parsed.data.intent };
}

export default function IntakeDetailPage() {
  const { submission: s } = useLoaderData<typeof loader>();
  const { t, locale } = useT();
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const pending = busy ? fetcher.formData : undefined;
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const canActivate = !!s.person && (s.person.status === "new" || s.person.status === "lead");
  const p = s.payload;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={s.status === "new" ? "/app/admin/intake" : `/app/admin/intake?status=${s.status}`}>
          <ArrowLeft aria-hidden="true" />
          {t("admin.detail.back")}
        </Link>
      </Button>

      <PageHeader
        eyebrow={t("admin.detail.eyebrow")}
        title={p.full_name || "?"}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <IntakeStatusBadge status={s.status} />
            <span>{t("admin.detail.submittedOn", { date: formatDateTime(s.submitted_at, locale) })}</span>
            <span>{t("admin.detail.formLanguage", { language: t(s.locale === "es" ? "common.lang.es" : "common.lang.en") })}</span>
            {s.reviewed_at && (
              <span>
                {s.reviewed_by_name
                  ? t("admin.detail.reviewedBy", { name: s.reviewed_by_name, date: formatDate(s.reviewed_at, locale) })
                  : t("admin.detail.reviewedOn", { date: formatDate(s.reviewed_at, locale) })}
              </span>
            )}
          </span>
        }
        actions={
          s.status === "new" ? (
            <>
              {canActivate && (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="reviewed" />
                  <input type="hidden" name="activate" value="on" />
                  <Button type="submit" variant="brand" disabled={busy}>
                    <CheckCircle2 aria-hidden="true" />
                    {pending?.get("activate") ? t("common.state.saving") : t("admin.detail.accept")}
                  </Button>
                </fetcher.Form>
              )}
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="reviewed" />
                <Button type="submit" variant={canActivate ? "outline" : "brand"} disabled={busy}>
                  <Check aria-hidden="true" />
                  {pending?.get("intent") === "reviewed" && !pending.get("activate") ? t("common.state.saving") : t("admin.detail.markReviewed")}
                </Button>
              </fetcher.Form>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="archived" />
                <Button type="submit" variant="ghost" disabled={busy}>
                  <Archive aria-hidden="true" />
                  {pending?.get("intent") === "archived" ? t("common.state.saving") : t("admin.detail.archive")}
                </Button>
              </fetcher.Form>
            </>
          ) : (
            <>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="new" />
                <Button type="submit" variant="ghost" disabled={busy}>
                  <RotateCcw aria-hidden="true" />
                  {pending?.get("intent") === "new" ? t("common.state.saving") : t("admin.detail.moveToNew")}
                </Button>
              </fetcher.Form>
              {s.status === "reviewed" && (
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="archived" />
                  <Button type="submit" variant="ghost" disabled={busy}>
                    <Archive aria-hidden="true" />
                    {pending?.get("intent") === "archived" ? t("common.state.saving") : t("admin.detail.archive")}
                  </Button>
                </fetcher.Form>
              )}
            </>
          )
        }
      />

      {searchParams.get("done") === "1" && !result && (
        <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
          {t("admin.detail.doneNext")}
        </p>
      )}
      {result?.ok && (
        <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
          {t(`admin.detail.done.${result.done}`)}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
          {t(result.error)}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title={t("admin.detail.shared")}>
            <p className="-mt-2 mb-4 text-sm text-smoke">{t("admin.detail.asTyped")}</p>
            <Sheet>
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <Item label={t("common.field.email")}>
                  {p.email ? (
                    <a href={`mailto:${p.email}`} className="break-all underline decoration-stone decoration-2 underline-offset-4 hover:decoration-gold">
                      {p.email}
                    </a>
                  ) : (
                    <NotGiven />
                  )}
                </Item>
                <Item label={t("common.field.phone")}>{p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : <NotGiven />}</Item>
                <Item label={t("common.field.language")}>{t(`common.language.${p.preferred_language}`)}</Item>
                <Item label={t("common.field.organization")}>{p.organization ?? <NotGiven />}</Item>
                <Item label={t("common.field.title")}>{p.title ?? <NotGiven />}</Item>
                <Item label={t("common.field.affiliations")}>
                  {p.affiliations.length ? p.affiliations.map((a) => t(`common.affiliation.${a}`)).join(", ") : <NotGiven />}
                </Item>
                <Item label={t("common.field.contributions")} wide>
                  {p.contribution_types.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {p.contribution_types.map((type) => (
                        <ContributionChip key={type} type={type} long />
                      ))}
                    </div>
                  ) : (
                    <NotGiven />
                  )}
                </Item>
                <Item label={t("common.field.skills")}>{p.skills.length ? <TagList tags={p.skills} /> : <NotGiven />}</Item>
                <Item label={t("common.field.capTopics")}>{p.cap_topics.length ? <TopicList topics={p.cap_topics} /> : <NotGiven />}</Item>
                <Item label={t("common.field.availability")} wide>
                  {p.availability ? <p className="whitespace-pre-wrap">{p.availability}</p> : <NotGiven />}
                </Item>
                <Item label={t("common.field.bio")} wide>
                  {p.bio ? <p className="whitespace-pre-wrap">{p.bio}</p> : <NotGiven />}
                </Item>
                <Item label={t("admin.detail.consent")} wide>
                  {p.consent ? t("admin.detail.consentYes") : t("admin.detail.consentNo")}
                </Item>
              </dl>
            </Sheet>
          </Panel>

          <Panel title={t("admin.detail.referrals")}>
            {s.referrals.length ? (
              <ul className="grid gap-3">
                {s.referrals.map(({ referral, match }, i) => (
                  <li key={i}>
                    <Sheet className="grid gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <PersonAvatar name={referral.name} />
                          <div className="grid min-w-0">
                            <span className="font-medium">{referral.name}</span>
                            {(referral.email || referral.phone) && (
                              <span className="text-xs break-all text-smoke">{[referral.email, referral.phone].filter(Boolean).join(" · ")}</span>
                            )}
                          </div>
                        </div>
                        <MatchLink match={match} />
                      </div>
                      {(referral.how_known || referral.can_help_with) && (
                        <dl className="grid gap-3 sm:grid-cols-2">
                          {referral.how_known && <Item label={t("admin.detail.howKnown")}>{referral.how_known}</Item>}
                          {referral.can_help_with && <Item label={t("admin.detail.canHelpWith")}>{referral.can_help_with}</Item>}
                        </dl>
                      )}
                    </Sheet>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t("admin.detail.noReferrals")} />
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title={t("admin.detail.profile")}>
            {s.person ? (
              <Sheet className="grid gap-4">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={s.person.full_name} className="size-11" />
                  <div className="grid min-w-0">
                    <span className="truncate font-medium">{s.person.full_name}</span>
                    {(s.person.title || s.person.organization_name) && (
                      <span className="truncate text-xs text-smoke">
                        {[s.person.title, s.person.organization_name].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                  <span className="ml-auto">
                    <StatusBadge status={s.person.status} />
                  </span>
                </div>
                <ContributionChips types={s.person.contribution_types} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/app/people/${s.person.id}`}>
                      <UserRound aria-hidden="true" />
                      {t("admin.detail.viewProfile")}
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/app/people/${s.person.id}/edit`}>
                      <Pencil aria-hidden="true" />
                      {t("admin.detail.editProfile")}
                    </Link>
                  </Button>
                </div>
              </Sheet>
            ) : (
              <EmptyState title={t("admin.detail.notLinked")} />
            )}
          </Panel>

          <Panel title={t("admin.detail.referredBy")}>
            {p.referred_by ? (
              <Sheet className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PersonAvatar name={p.referred_by.name} />
                  <div className="grid min-w-0">
                    <span className="font-medium">{p.referred_by.name}</span>
                    {p.referred_by.email && <span className="text-xs break-all text-smoke">{p.referred_by.email}</span>}
                  </div>
                </div>
                <MatchLink match={s.referredBy} />
              </Sheet>
            ) : (
              <p className="text-sm text-smoke">{t("admin.detail.noReferrer")}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Item({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "grid gap-1 sm:col-span-2" : "grid gap-1"}>
      <dt className="text-eyebrow text-smoke">{label}</dt>
      <dd className="min-w-0 text-[0.95rem] text-ink">{children}</dd>
    </div>
  );
}

function NotGiven() {
  const { t } = useT();
  return <span className="text-smoke">{t("admin.detail.notGiven")}</span>;
}

function MatchLink({ match }: { match: MatchedPerson }) {
  const { t } = useT();
  if (!match) return <span className="text-xs text-smoke">{t("admin.detail.noMatch")}</span>;
  return (
    <span className="flex items-center gap-2">
      <StatusBadge status={match.status} />
      <Button variant="outline" size="sm" asChild>
        <Link to={`/app/people/${match.id}`} aria-label={t("admin.detail.viewProfileOf", { name: match.full_name })}>
          <ExternalLink aria-hidden="true" />
          {t("admin.detail.viewProfile")}
        </Link>
      </Button>
    </span>
  );
}

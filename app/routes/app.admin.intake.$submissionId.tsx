/**
 * One sign-up, shown in full. Review sits at the top: possible matches with
 * their reasons, then one primary action (link to the strongest match, or
 * approve as a new person), with edit, reject and archive as quieter options.
 * Deciding moves on to the next new sign-up.
 */
import { TopicList } from "~/components/caps/cap-bits";
import { data, Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { ReactNode } from "react";
import { Archive, ArrowLeft, ExternalLink, Pencil, RotateCcw, UserRound } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/app.admin.intake.$submissionId";
import { IntakeStatusBadge, formatDate, formatDateTime } from "~/components/admin/format";
import {
  ApproveForm,
  DoneNotice,
  MatchList,
  REVIEW_FETCHER,
  SecondaryActions,
  VisibilityNote,
  isStrongMatch,
  type ReviewActionData,
} from "~/components/intake/review";
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
import { approveIntake, linkIntake, readIntakeEdits, rejectIntake, saveIntakeEdits } from "~/lib/intake.server";
import type { IntakePayload } from "~/lib/intake-types";

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

const ActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("approve"), show: z.literal("on").optional() }),
  z.object({ intent: z.literal("link"), personId: z.string().min(1).max(64), show: z.literal("on").optional() }),
  z.object({ intent: z.literal("reject"), note: z.string().max(2000).optional() }),
  z.object({ intent: z.literal("edit") }),
  z.object({ intent: z.literal("archived") }),
  z.object({ intent: z.literal("new") }),
]);

const failed = (error: ReviewActionData & { ok: false }, status: number) => data<ReviewActionData>(error, { status });

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const id = params.submissionId;
  const form = await request.formData();
  const parsed = ActionSchema.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k !== "contribution_types")));
  if (!parsed.success) return failed({ ok: false, error: "admin.error.invalid" }, 400);
  const input = parsed.data;

  // Decisions go straight to the next new sign-up, with a note (and a profile link) on arrival.
  const moveOn = async (done: "approved" | "linked" | "rejected" | "archived", personId?: string | null) => {
    const next = await nextNewIntake(id);
    const query = new URLSearchParams({ done, ...(personId ? { person: personId } : {}) });
    return redirect(next ? `/app/admin/intake/${next}?${query}` : `/app/admin/intake?${query}`);
  };

  switch (input.intent) {
    case "approve": {
      const result = await approveIntake(user, id, { showInDirectory: input.show === "on" });
      return result.ok ? moveOn("approved", result.personId) : failed(result, result.error === "admin.error.signupNotFound" ? 404 : 409);
    }
    case "link": {
      const result = await linkIntake(user, id, input.personId, { showInDirectory: input.show === "on" });
      return result.ok ? moveOn("linked", result.personId) : failed(result, result.error === "admin.error.signupNotFound" ? 404 : 409);
    }
    case "reject": {
      const result = await rejectIntake(user, id, input.note ?? null);
      return result.ok ? moveOn("rejected") : failed(result, result.error === "admin.error.signupNotFound" ? 404 : 409);
    }
    case "edit": {
      const current = await getIntakeSubmission(id);
      if (!current) return failed({ ok: false, error: "admin.error.signupNotFound" }, 404);
      const edits = readIntakeEdits(form, current.payload);
      if (!edits.ok) return failed({ ok: false, error: "admin.error.invalid", fieldErrors: edits.errors }, 400);
      const result = await saveIntakeEdits(user, id, edits.payload);
      return result.ok ? data<ReviewActionData>({ ok: true, done: "edited" }) : failed(result, 409);
    }
    case "archived": {
      if (!(await setIntakeStatus(id, "archived", user.id))) return failed({ ok: false, error: "admin.error.signupNotFound" }, 404);
      return moveOn("archived");
    }
    case "new": {
      if (!(await setIntakeStatus(id, "new", user.id))) return failed({ ok: false, error: "admin.error.cantReopen" }, 409);
      return data<ReviewActionData>({ ok: true, done: "new" });
    }
  }
}

export default function IntakeDetailPage() {
  const { submission: s } = useLoaderData<typeof loader>();
  const { t, locale } = useT();
  const fetcher = useFetcher<ReviewActionData>({ key: REVIEW_FETCHER });
  const busy = fetcher.state !== "idle";
  const pendingIntent = busy ? fetcher.formData?.get("intent") : null;
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const p = s.payload;
  const person = s.person;
  const strongest = s.duplicates[0];
  const linkFirst = isStrongMatch(strongest);

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
          </span>
        }
        actions={
          s.status === "rejected" || s.status === "archived" ? (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="new" />
              <Button type="submit" variant="ghost" disabled={busy}>
                <RotateCcw aria-hidden="true" />
                {pendingIntent === "new" ? t("common.state.saving") : t("admin.detail.moveToNew")}
              </Button>
            </fetcher.Form>
          ) : (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="archived" />
              <Button type="submit" variant="ghost" disabled={busy}>
                <Archive aria-hidden="true" />
                {pendingIntent === "archived" ? t("common.state.saving") : t("admin.detail.archive")}
              </Button>
            </fetcher.Form>
          )
        }
      />

      <DoneNotice
        fallback={
          <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
            {t("admin.detail.doneNext")}
          </p>
        }
      />
      {result?.ok && (
        <p role="status" className="rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
          {t(`admin.detail.done.${result.done}`)}
        </p>
      )}
      {result && !result.ok && !result.fieldErrors && (
        <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
          {t(result.error)}
        </p>
      )}

      {s.status === "new" ? (
        <Panel title={t("admin.detail.decide")}>
          <div className="grid gap-6">
            <section aria-labelledby="matches-title" className="grid gap-3">
              <div>
                <h3 id="matches-title" className="font-medium">{t("admin.detail.matches.title")}</h3>
                {s.duplicates.length > 0 && <p className="text-sm text-smoke">{t("admin.detail.matches.hint")}</p>}
              </div>
              <MatchList duplicates={s.duplicates} primaryId={linkFirst ? strongest.id : null} />
            </section>
            <div className="border-t border-stone pt-5">
              <ApproveForm primary={!linkFirst} />
            </div>
            <SecondaryActions payload={p} />
          </div>
        </Panel>
      ) : (
        <DecisionSummary submission={s} />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title={t("admin.detail.shared")}>
            <p className="-mt-2 mb-4 text-sm text-smoke">{s.original ? t("admin.detail.edited") : t("admin.detail.asTyped")}</p>
            <Sheet>
              <PayloadDetails payload={p} />
            </Sheet>
            {s.original && (
              <details className="mt-4 rounded-xl ring-1 ring-stone">
                <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  {t("admin.detail.showOriginal")}
                </summary>
                <div className="px-4 pb-4">
                  <PayloadDetails payload={s.original} showName />
                </div>
              </details>
            )}
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
          {person && (
            <Panel title={t("admin.detail.profile")}>
                <Sheet className="grid gap-4">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={person.full_name} className="size-11" />
                    <div className="grid min-w-0">
                      <span className="truncate font-medium">{person.full_name}</span>
                      {(person.title || person.organization_name) && (
                        <span className="truncate text-xs text-smoke">
                          {[person.title, person.organization_name].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                    <span className="ml-auto">
                      <StatusBadge status={person.status} />
                    </span>
                  </div>
                  <ContributionChips types={person.contribution_types} />
                  <VisibilityNote visible={person.directory_visible} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/app/people/${person.id}`}>
                        <UserRound aria-hidden="true" />
                        {t("admin.detail.viewProfile")}
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/app/people/${person.id}/edit`}>
                        <Pencil aria-hidden="true" />
                        {t("admin.detail.editProfile")}
                      </Link>
                    </Button>
                  </div>
                </Sheet>
            </Panel>
          )}

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

function PayloadDetails({ payload: p, showName }: { payload: IntakePayload; showName?: boolean }) {
  const { t } = useT();
  return (
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      {showName && (
        <Item label={t("common.field.name")} wide>
          {p.full_name}
        </Item>
      )}
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
  );
}

/** For a decided sign-up: what was decided, by whom and when, and the private note. */
function DecisionSummary({ submission: s }: { submission: IntakeDetail }) {
  const { t, locale } = useT();
  if (s.status === "new") return null;
  return (
    <Panel title={t("admin.detail.decide")}>
      <Sheet className="grid gap-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{t(`admin.detail.decided.${s.status}`)}</span>
          {s.decided_at && (
            <span className="text-sm text-smoke">
              {s.decided_by_name
                ? t("admin.detail.reviewedBy", { name: s.decided_by_name, date: formatDate(s.decided_at, locale) })
                : t("admin.detail.reviewedOn", { date: formatDate(s.decided_at, locale) })}
            </span>
          )}
        </p>
        {s.decision_note && (
          <div className="grid gap-1">
            <span className="text-eyebrow text-smoke">{t("admin.detail.decisionNote")}</span>
            <p className="whitespace-pre-wrap text-[0.95rem]">{s.decision_note}</p>
          </div>
        )}
      </Sheet>
    </Panel>
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

/**
 * /app/opportunities/:opportunityId (admins only): one opportunity. Move its
 * stage (recorded in the person's history; the person's status never
 * changes), edit details, manage its follow-ups, see its history, delete it.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, data, redirect, useActionData, useFetcher, useLoaderData } from "react-router";
import { ArrowLeft, Check, Pencil, Trash2 } from "lucide-react";
import type { Route } from "./+types/app.opportunities.$opportunityId";
import { StageBadge, crmDate, stageDot } from "~/components/crm/crm-bits";
import { FollowUpList } from "~/components/crm/follow-up-list";
import { OpportunityForm } from "~/components/crm/opportunity-form";
import { QuickFollowUpForm } from "~/components/crm/quick-follow-up-form";
import { PageHeader, Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { makeT, translateMaybe, useT } from "~/i18n";
import { STAGES_BY_TRACK } from "~/lib/constants";
import { schoolToday } from "~/lib/dates";
import { listFollowUps } from "~/lib/follow-ups.server";
import {
  OpportunityInputError,
  changeOpportunityStage,
  deleteOpportunity,
  getCrmFormOptions,
  getOpportunity,
  getOpportunityHistory,
  parseOpportunityForm,
  type OpportunityFormErrors,
  updateOpportunity,
} from "~/lib/opportunities.server";
import { notFound, requireAdminViewer } from "~/lib/permissions.server";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ data: loaderData, matches }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const title = (loaderData as { opportunity?: { title: string } } | undefined)?.opportunity?.title ?? t("crm.opps.title");
  return [{ title: `${title} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireAdminViewer(request);
  const opportunity = await getOpportunity(user, params.opportunityId);
  if (!opportunity) notFound();
  const today = schoolToday();
  const [followUps, history, options] = await Promise.all([
    listFollowUps(user, { opportunityId: opportunity.id, views: ["overdue", "today", "upcoming", "awaiting", "completed"], today }),
    getOpportunityHistory(user, opportunity.id),
    getCrmFormOptions(user),
  ]);
  return { opportunity, followUps, history, today, ...options };
}

type ActionResult = { ok: boolean; intent: string; changed?: boolean; errors?: OpportunityFormErrors };

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireAdminViewer(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = params.opportunityId;
  const reply = (body: ActionResult, status = 200) => data<ActionResult>(body, { status });
  try {
    if (intent === "stage") {
      const stage = String(form.get("stage") ?? "");
      const note = String(form.get("note") ?? "").slice(0, 500);
      const result = await changeOpportunityStage(user, id, stage, note);
      return reply({ ok: true, intent, changed: result.changed });
    }
    if (intent === "update") {
      const parsed = parseOpportunityForm(form);
      if (!parsed.ok) return reply({ ok: false, intent, errors: parsed.errors }, 400);
      await updateOpportunity(user, id, parsed.value);
      return reply({ ok: true, intent });
    }
    if (intent === "delete") {
      await deleteOpportunity(user, id);
      return redirect("/app/opportunities");
    }
  } catch (error) {
    if (error instanceof OpportunityInputError) {
      return reply({ ok: false, intent, errors: { [error.message === "person" ? "personId" : "stage"]: "crm.error.badChoice" } }, 400);
    }
    throw error;
  }
  return reply({ ok: false, intent }, 400);
}

export default function OpportunityDetail() {
  const { opportunity: o, followUps, history, today, people, caps, owners } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, locale } = useT();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (actionData?.ok && actionData.intent === "update") setEditing(false);
  }, [actionData]);

  const openFollowUps = followUps.filter((f) => f.status === "open");
  const doneFollowUps = followUps.filter((f) => f.status === "completed");

  return (
    <div className="grid gap-8">
      <Link to="/app/opportunities" className="inline-flex w-fit items-center gap-1.5 text-sm text-graphite hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("crm.opps.back")}
      </Link>

      <PageHeader
        eyebrow={`${t(`common.track.${o.track}`)} · ${t(`common.opportunityKind.${o.kind}`)}`}
        title={o.title}
        description={
          o.person_id ? (
            <Link to={`/app/people/${o.person_id}`} className="font-medium text-graphite underline-offset-4 hover:text-ink hover:underline">
              {o.person_name}
              {o.organization_name && <span className="font-normal text-smoke">, {o.organization_name}</span>}
            </Link>
          ) : (
            t("crm.opps.row.noPerson")
          )
        }
        actions={<StageBadge stage={o.stage} className="h-7 px-3 text-sm" />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <StagePanel id={o.id} track={o.track} stage={o.stage} key={o.stage} />

          <Panel title={t("crm.opps.detail.followUps")}>
            <FollowUpList
              items={[...openFollowUps, ...doneFollowUps]}
              today={today}
              showPerson={false}
              showOpportunity={false}
              empty={t("crm.opps.detail.followUpsEmpty")}
            />
            {o.person_id && (
              <div className="mt-4 rounded-card bg-canvas p-4 shadow-whisper">
                <QuickFollowUpForm today={today} personId={o.person_id} opportunityId={o.id} owners={owners} defaultOwnerId={o.owner_user_id ?? undefined} submitVariant="brand" />
              </div>
            )}
          </Panel>

          <Panel title={t("crm.opps.detail.history")}>
            {history.length ? (
              <ol className="divide-y divide-stone">
                {history.map((h) => (
                  <li key={h.id} className="grid gap-0.5 py-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
                    <time dateTime={h.happened_on} className="text-xs text-smoke tabular-nums sm:pt-0.5">
                      {crmDate(h.happened_on, locale, today)}
                    </time>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink">{translateMaybe(locale, `common.engagement.${h.kind}`, h.kind)}</p>
                      {h.notes && <p className="text-graphite">{h.notes}</p>}
                      {h.user_name && <p className="text-xs text-smoke">{t("crm.opps.detail.by", { name: h.user_name })}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-3 text-sm text-smoke">{t("crm.opps.detail.historyEmpty")}</p>
            )}
          </Panel>
        </div>

        <div className="grid gap-6">
          <Panel
            title={t("crm.opps.detail.details")}
            action={
              !editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden="true" />
                  {t("crm.opps.detail.edit")}
                </Button>
              )
            }
          >
            {editing ? (
              <OpportunityForm
                people={people}
                caps={caps}
                owners={owners}
                intent="update"
                values={{
                  personId: o.person_id,
                  track: o.track,
                  kind: o.kind,
                  stage: o.stage,
                  title: o.title,
                  amount: o.amount,
                  targetDate: o.target_date,
                  capId: o.cap_id,
                  ownerUserId: o.owner_user_id,
                  notes: o.notes,
                }}
                errors={actionData?.intent === "update" ? actionData.errors : undefined}
                submitLabel={t("crm.opps.form.save")}
                pendingLabel={t("crm.opps.form.saving")}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <dl className="grid gap-3 text-sm">
                <Detail label={t("crm.opps.detail.kind")}>{t(`common.opportunityKind.${o.kind}`)}</Detail>
                <Detail label={t("crm.opps.detail.amount")}>{o.amount}</Detail>
                <Detail label={t("crm.opps.detail.target")}>{o.target_date && crmDate(o.target_date, locale, today)}</Detail>
                <Detail label={t("crm.opps.detail.cap")}>
                  {o.cap_id && (
                    <Link to={`/app/caps/${o.cap_id}`} className="underline-offset-4 hover:underline">
                      {o.cap_title}
                    </Link>
                  )}
                </Detail>
                <Detail label={t("crm.opps.detail.owner")}>{o.owner_name}</Detail>
                <Detail label={t("crm.opps.detail.notes")}>{o.notes && <span className="whitespace-pre-line">{o.notes}</span>}</Detail>
                <p className="text-xs text-smoke">
                  {o.open ? t("crm.opps.detail.open") : t("crm.opps.detail.closedOn", { date: crmDate(o.closed_at, locale, today) })}
                </p>
              </dl>
            )}
          </Panel>

          <DeleteOpportunity />
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useT();
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <dt className="text-smoke">{label}</dt>
      <dd className={cn(empty ? "text-ash" : "text-ink")}>{empty ? t("crm.opps.detail.none") : children}</dd>
    </div>
  );
}

function StagePanel({ id, track, stage }: { id: string; track: "engagement" | "funding"; stage: string }) {
  const { t } = useT();
  const fetcher = useFetcher<{ ok: boolean; changed?: boolean }>();
  const pending = fetcher.formData?.get("stage") as string | undefined;
  const shown = pending ?? stage;
  const saved = fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.changed;
  return (
    <Panel title={t("crm.opps.detail.stage")} action={saved ? <span className="text-sm text-sage-ink">{t("crm.opps.detail.stageSaved")}</span> : undefined}>
      <fetcher.Form method="post" className="grid gap-4">
        <input type="hidden" name="intent" value="stage" />
        <div role="group" aria-label={t("crm.opps.detail.stage")} className="flex flex-wrap gap-2">
          {STAGES_BY_TRACK[track].map((s) => {
            const current = s === shown;
            return (
              <button
                key={s}
                type="submit"
                name="stage"
                value={s}
                aria-pressed={current}
                disabled={fetcher.state !== "idle"}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-wait",
                  current ? "border-ink bg-canvas font-medium text-ink shadow-whisper" : "border-stone bg-canvas/60 text-graphite hover:border-ash hover:text-ink",
                )}
              >
                {current ? <Check className="size-3.5" aria-hidden="true" /> : <span className={cn("size-2 rounded-full", stageDot(s as never))} aria-hidden="true" />}
                {t(`common.stage.${s}`)}
              </button>
            );
          })}
        </div>
        <div className="grid max-w-md gap-1">
          <Label htmlFor={`stage-note-${id}`} className="text-xs text-smoke">
            {t("crm.opps.detail.stageNote")}
          </Label>
          <Input id={`stage-note-${id}`} name="note" maxLength={500} placeholder={t("crm.opps.detail.stageNotePlaceholder")} className="h-9 bg-canvas" />
        </div>
        <p className="text-xs text-smoke">{t("crm.opps.detail.stageHint")}</p>
      </fetcher.Form>
    </Panel>
  );
}

function DeleteOpportunity() {
  const { t } = useT();
  const fetcher = useFetcher();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" className="w-fit text-smoke hover:text-destructive" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden="true" />
        {t("crm.opps.detail.delete")}
      </Button>
    );
  }
  return (
    <fetcher.Form method="post" className="grid gap-3 rounded-card border border-stone p-4">
      <input type="hidden" name="intent" value="delete" />
      <p className="text-sm text-graphite">{t("crm.opps.detail.deleteConfirm")}</p>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={fetcher.state !== "idle"}>
          {t("crm.opps.detail.deleteYes")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          {t("crm.opps.detail.deleteNo")}
        </Button>
      </div>
    </fetcher.Form>
  );
}

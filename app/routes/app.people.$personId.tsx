/**
 * One person's profile: who they are, how NVA can reach them, their
 * connections, CAPs and activity. Staff see only people in the staff
 * directory (anyone else is a 404), without private CRM fields, and may log
 * only the work itself (lessons, volunteering, internships, guest talks).
 * Only admins can edit, change status or remove things (checked in the action
 * too). Deleting a person happens from the edit page but posts here.
 */
import { TopicList } from "~/components/caps/cap-bits";
import { useEffect, useState, type ReactNode } from "react";
import { Link, data, redirect, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { ArrowLeft, Globe, Mail, NotebookPen, Pencil, Phone, Plus } from "lucide-react";
import type { Route } from "./+types/app.people.$personId";
import { schoolToday } from "~/components/people/format";
import { IntroPaths } from "~/components/people/intro-paths";
import { ActivityTimeline, CapsList, ConnectionsList } from "~/components/people/profile-sections";
import {
  CapForm,
  ConnectionForm,
  LogActivityForm,
  type ProfileActionData,
} from "~/components/people/record-forms";
import { ContributionChip, PageHeader, Panel, PersonAvatar, Sheet, StatusBadge, TagList } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireAdmin, requireUser } from "~/lib/auth.server";
import { addCapPartner, getCap, getCapsForPerson, listCaps } from "~/lib/caps.server";
import {
  ADMIN_LOGGABLE_KINDS,
  CONTRIBUTION_TYPES,
  PERSON_STATUSES,
  STAFF_LOGGABLE_KINDS,
  type PersonStatus,
} from "~/lib/constants";
import { query, queryOne } from "~/lib/db.server";
import { canViewPerson, isAdmin as isAdminViewer, visibleToSql } from "~/lib/permissions.server";
import {
  parseCapPartnerForm,
  parseConnectionForm,
  parseEngagementForm,
  parseTargetId,
} from "~/lib/people-form.server";
import {
  addRelationship,
  deleteEngagement,
  deletePerson,
  findIntroPaths,
  getEngagements,
  getPerson,
  getRelationships,
  logEngagement,
  removeRelationship,
  updatePerson,
} from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches, loaderData }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const name = loaderData?.person.full_name ?? t("people.profile.title");
  return [{ title: `${name} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  // Hidden from this viewer looks the same as missing.
  const person = await getPerson(params.personId, user);
  if (!person) throw data(null, { status: 404 });
  const isAdmin = isAdminViewer(user);

  const [paths, relationships, caps, engagements, allCaps, others, intake] = await Promise.all([
    findIntroPaths(person.id, user),
    getRelationships(person.id, user),
    getCapsForPerson(person.id),
    getEngagements(person.id, user),
    listCaps(),
    query<{ id: string; full_name: string; organization_name: string | null }>(
      `SELECT p.id, p.full_name, o.name AS organization_name
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE p.id <> $1 AND ${visibleToSql(user, "p")} ORDER BY p.full_name LIMIT 2000`,
      [person.id],
    ),
    isAdmin
      ? queryOne<{ id: string }>(
          "SELECT id FROM intake_submissions WHERE person_id = $1 ORDER BY submitted_at DESC LIMIT 1",
          [person.id],
        )
      : Promise.resolve(null),
  ]);

  return {
    person,
    paths,
    relationships,
    caps,
    engagements,
    capOptions: allCaps.map((c) => ({ value: c.id, label: c.title })),
    peopleOptions: others.map((p) => ({
      value: p.id,
      label: p.organization_name ? `${p.full_name}, ${p.organization_name}` : p.full_name,
    })),
    intakeId: intake?.id ?? null,
    isAdmin,
    logKinds: isAdmin ? ADMIN_LOGGABLE_KINDS : STAFF_LOGGABLE_KINDS,
    today: schoolToday(),
  };
}

const fail = (intent: string, errors: Partial<Record<string, MessageKey>>, status = 400) =>
  data<ProfileActionData>({ ok: false, intent, errors }, { status });
const done = (intent: string) => data<ProfileActionData>({ ok: true, intent });

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const personId = params.personId;
  // Staff can only add to records they can see; a hidden person is a 404 like a missing one.
  if (!(await canViewPerson(user, personId))) throw data(null, { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  switch (intent) {
    case "logEngagement": {
      const parsed = parseEngagementForm(form);
      if (!parsed.ok) return fail(intent, parsed.errors);
      // Staff log the work itself only; calls, meetings, notes and emails are admin history.
      const allowed: readonly string[] = isAdminViewer(user) ? ADMIN_LOGGABLE_KINDS : STAFF_LOGGABLE_KINDS;
      if (!allowed.includes(parsed.value.kind)) return fail(intent, { kind: "people.error.kind" }, 403);
      const { capId, ...rest } = parsed.value;
      if (capId && !(await getCap(capId))) return fail(intent, { _form: "people.error.notFound" });
      await logEngagement({ personId, capId, ...rest }, user.id);
      return done(intent);
    }

    case "addConnection": {
      const parsed = parseConnectionForm(form);
      if (!parsed.ok) return fail(intent, parsed.errors);
      const { relatedPersonId, kind, note } = parsed.value;
      if (relatedPersonId === personId) return fail(intent, { related_person_id: "people.error.person" });
      if (!(await canViewPerson(user, relatedPersonId))) return fail(intent, { _form: "people.error.notFound" });
      await addRelationship({ personId, relatedPersonId, kind, note, source: "admin" }, user.id);
      return done(intent);
    }

    case "addToCap": {
      const parsed = parseCapPartnerForm(form);
      if (!parsed.ok) return fail(intent, parsed.errors);
      if (!(await getCap(parsed.value.capId))) return fail(intent, { _form: "people.error.notFound" });
      await addCapPartner({ capId: parsed.value.capId, personId, role: parsed.value.role }, user.id);
      return done(intent);
    }

    case "deleteEngagement": {
      await requireAdmin(request);
      const targetId = parseTargetId(form);
      const row =
        targetId &&
        (await queryOne<{ id: string }>("SELECT id FROM engagements WHERE id = $1 AND person_id = $2", [targetId, personId]));
      if (!row) return fail(intent, { _form: "people.error.notFound" }, 404);
      await deleteEngagement(row.id);
      return done(intent);
    }

    case "removeRelationship": {
      await requireAdmin(request);
      const targetId = parseTargetId(form);
      const row =
        targetId &&
        (await queryOne<{ id: string }>(
          "SELECT id FROM relationships WHERE id = $1 AND (person_id = $2 OR related_person_id = $2)",
          [targetId, personId],
        ));
      if (!row) return fail(intent, { _form: "people.error.notFound" }, 404);
      await removeRelationship(row.id);
      return done(intent);
    }

    case "setStatus": {
      await requireAdmin(request);
      const status = String(form.get("status") ?? "");
      if (!(PERSON_STATUSES as readonly string[]).includes(status)) return fail(intent, { _form: "people.error.unknownAction" });
      await updatePerson(personId, { status: status as PersonStatus });
      return done(intent);
    }

    case "deletePerson": {
      await requireAdmin(request);
      await deletePerson(personId);
      return redirect("/app/people");
    }

    default:
      return fail(intent, { _form: "people.error.unknownAction" });
  }
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <h3 className="text-eyebrow text-smoke">{label}</h3>
      {children}
    </div>
  );
}

/** Admins change status right in the header; it saves as soon as it changes. */
function StatusSelect({ status }: { status: PersonStatus }) {
  const { t } = useT();
  const fetcher = useFetcher<ProfileActionData>();
  const current = (fetcher.formData?.get("status") as PersonStatus | null) ?? status;
  const result = fetcher.state === "idle" && fetcher.data?.intent === "setStatus" ? fetcher.data : null;
  // "Status updated" shows for a moment after each save.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!result?.ok) return;
    setShowSaved(true);
    const timer = window.setTimeout(() => setShowSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [result]);
  const error = result && !result.ok ? (result.errors._form ?? "common.state.error") : null;
  return (
    <span className="inline-flex items-center gap-2">
      <Select value={current} onValueChange={(value) => fetcher.submit({ intent: "setStatus", status: value }, { method: "post" })}>
        <SelectTrigger size="sm" aria-label={t("common.field.status")} className="rounded-full bg-canvas text-xs">
          {/* Explicit text so the status shows before the page's JavaScript loads. */}
          <SelectValue>{t(`common.status.${current}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PERSON_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`common.status.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span role="status" className="text-xs text-sage-ink">
        {showSaved ? t("people.profile.statusSaved") : ""}
      </span>
      {error && (
        <span role="alert" className="text-xs text-rust-ink">
          {t(error)}
        </span>
      )}
    </span>
  );
}

/** A quiet "+ Add ..." toggle that reveals a form under a list. */
function AddToggle({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible className="mt-4 grid gap-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 w-fit">
          <Plus aria-hidden="true" />
          {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

export default function PersonProfile() {
  const { person, paths, relationships, caps, engagements, capOptions, peopleOptions, intakeId, isAdmin, logKinds, today } =
    useLoaderData<typeof loader>();
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const logCap = searchParams.get("logCap");
  const defaultCap = logCap && capOptions.some((c) => c.value === logCap) ? logCap : undefined;
  const ways = CONTRIBUTION_TYPES.filter((type) => person.contribution_types.includes(type));
  const subtitle =
    person.title && person.organization_name
      ? t("people.profile.atOrg", { title: person.title, org: person.organization_name })
      : (person.title ?? person.organization_name);
  const sourceLine = person.source ? t("people.profile.sourceLine", { source: t(`common.source.${person.source}`) }) : null;
  const hasDetails =
    person.skills.length > 0 ||
    person.cap_topics.length > 0 ||
    !!person.funding_focus ||
    !!person.availability ||
    !!person.bio ||
    !!person.notes;

  return (
    <div className="grid gap-6">
      <Link
        to="/app/people"
        className="inline-flex w-fit items-center gap-1.5 rounded-full text-sm text-smoke hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("people.profile.backToPeople")}
      </Link>

      <PageHeader
        eyebrow={t("people.profile.eyebrow")}
        title={
          <span className="flex items-center gap-4">
            <PersonAvatar name={person.full_name} className="size-14 text-base" />
            <span className="min-w-0 break-words">{person.full_name}</span>
          </span>
        }
        description={
          <span className="grid gap-2.5">
            {subtitle && <span className="text-graphite">{subtitle}</span>}
            <span className="flex flex-wrap items-center gap-1.5">
              {isAdmin ? <StatusSelect status={person.status} /> : <StatusBadge status={person.status} />}
              {person.affiliations.map((a) => (
                <span key={a} className="inline-flex h-5 items-center rounded-full border border-stone bg-canvas px-2 text-[0.7rem] text-graphite">
                  {t(`common.affiliation.${a}`)}
                </span>
              ))}
              {sourceLine &&
                (isAdmin && intakeId ? (
                  <Link
                    to={`/app/admin/intake/${intakeId}`}
                    className="text-xs text-smoke underline decoration-stone underline-offset-4 hover:text-ink hover:decoration-gold"
                  >
                    {sourceLine}
                  </Link>
                ) : (
                  <span className="text-xs text-smoke">{sourceLine}</span>
                ))}
            </span>
          </span>
        }
        actions={
          <>
            {person.email && (
              <Button asChild variant="outline">
                <a href={`mailto:${person.email}`}>
                  <Mail aria-hidden="true" />
                  {t("people.profile.actionEmail")}
                </a>
              </Button>
            )}
            {person.phone && (
              <Button asChild variant="outline">
                <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}>
                  <Phone aria-hidden="true" />
                  {t("people.profile.actionCall")}
                </a>
              </Button>
            )}
            <Button asChild variant="brand">
              <a href="#log-activity">
                <NotebookPen aria-hidden="true" />
                {t("people.profile.logSubmit")}
              </a>
            </Button>
            {isAdmin && (
              <Button asChild variant="outline">
                <Link to={`/app/people/${person.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  {t("common.action.edit")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Panel title={t("people.profile.details")} bodyClassName="grid gap-5">
            <DetailBlock label={t("common.field.contributions")}>
              {ways.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {ways.map((type) => (
                    <ContributionChip key={type} type={type} long className="h-7 text-sm" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-smoke">{t("people.profile.notAdded")}</p>
              )}
            </DetailBlock>
            {!hasDetails && <p className="text-sm text-smoke">{t("people.profile.noDetails")}</p>}
            {(person.skills.length > 0 || person.cap_topics.length > 0) && (
              <div className="grid gap-5 sm:grid-cols-2">
                {person.skills.length > 0 && (
                  <DetailBlock label={t("common.field.skills")}>
                    <TagList tags={person.skills} />
                  </DetailBlock>
                )}
                {person.cap_topics.length > 0 && (
                  <DetailBlock label={t("common.field.capTopics")}>
                    <TopicList topics={person.cap_topics} />
                  </DetailBlock>
                )}
              </div>
            )}
            {person.funding_focus && (
              <DetailBlock label={t("common.field.fundingFocus")}>
                <p className="text-sm leading-relaxed whitespace-pre-line text-graphite">{person.funding_focus}</p>
              </DetailBlock>
            )}
            {person.availability && (
              <DetailBlock label={t("common.field.availability")}>
                <p className="text-sm text-graphite">{person.availability}</p>
              </DetailBlock>
            )}
            {person.bio && (
              <DetailBlock label={t("common.field.bio")}>
                <p className="text-sm leading-relaxed whitespace-pre-line text-graphite">{person.bio}</p>
              </DetailBlock>
            )}
            {person.notes && (
              <DetailBlock label={t("common.field.notes")}>
                <p className="rounded-xl bg-canvas p-3 text-sm leading-relaxed whitespace-pre-line text-graphite">{person.notes}</p>
              </DetailBlock>
            )}
          </Panel>

          <Panel title={t("people.profile.activityTitle")} bodyClassName="grid gap-6">
            <div id="log-activity" className="scroll-mt-24 rounded-xl bg-canvas p-4">
              <LogActivityForm caps={capOptions} today={today} defaultCap={defaultCap} kinds={logKinds} />
            </div>
            <ActivityTimeline engagements={engagements} isAdmin={isAdmin} />
          </Panel>
        </div>

        <div className="grid min-w-0 gap-6">
          <Sheet className="grid h-fit gap-4">
            <h2 className="text-section">{t("people.profile.contact")}</h2>
            {person.email || person.phone ? (
              <ul className="grid gap-2 text-sm">
                {person.email && (
                  <li>
                    <a
                      href={`mailto:${person.email}`}
                      aria-label={t("people.profile.emailThem", { name: person.full_name })}
                      className="flex items-center gap-2 break-all text-ink underline decoration-stone underline-offset-4 hover:decoration-gold"
                    >
                      <Mail className="size-4 shrink-0 text-smoke" aria-hidden="true" />
                      {person.email}
                    </a>
                  </li>
                )}
                {person.phone && (
                  <li>
                    <a
                      href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
                      aria-label={t("people.profile.callThem", { name: person.full_name })}
                      className="flex items-center gap-2 text-ink underline decoration-stone underline-offset-4 hover:decoration-gold"
                    >
                      <Phone className="size-4 shrink-0 text-smoke" aria-hidden="true" />
                      {person.phone}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-smoke">{t("people.profile.noContact")}</p>
            )}
            <dl className="grid gap-3 border-t border-stone pt-4 text-sm">
              <div>
                <dt className="text-xs text-smoke">{t("common.field.language")}</dt>
                <dd className="text-graphite">{t(`common.language.${person.preferred_language}`)}</dd>
              </div>
              {person.organization_name && (
                <div>
                  <dt className="text-xs text-smoke">{t("common.field.organization")}</dt>
                  <dd className="text-graphite">
                    {person.organization_name}
                    {person.organization_kind && (
                      <span className="text-smoke"> ({t(`common.orgKind.${person.organization_kind}`)})</span>
                    )}
                  </dd>
                </div>
              )}
              {person.organization_website && /^https?:\/\//i.test(person.organization_website) && (
                <div>
                  <dt className="text-xs text-smoke">{t("common.field.website")}</dt>
                  <dd>
                    <a
                      href={person.organization_website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 break-all text-ink underline decoration-stone underline-offset-4 hover:decoration-gold"
                    >
                      <Globe className="size-4 shrink-0 text-smoke" aria-hidden="true" />
                      {person.organization_website.replace(/^https?:\/\//i, "")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Sheet>

          <Panel title={t("people.profile.capsTitle")}>
            <CapsList caps={caps} />
            <AddToggle label={t("people.profile.addToCap")}>
              <CapForm caps={capOptions} />
            </AddToggle>
          </Panel>

          <Panel title={t("people.profile.connectionsTitle")}>
            <ConnectionsList relationships={relationships} isAdmin={isAdmin} />
            <AddToggle label={t("people.profile.addConnection")}>
              <ConnectionForm people={peopleOptions} personName={person.full_name} />
            </AddToggle>
          </Panel>

          <Panel title={t("people.profile.reachTitle")}>
            <p className="-mt-2 mb-4 text-sm text-smoke">{t("people.profile.reachDescription")}</p>
            <IntroPaths paths={paths} person={person} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

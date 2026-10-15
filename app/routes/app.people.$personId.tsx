/**
 * One person's profile: who they are, how NVA can reach them, their
 * connections, CAPs and activity. Teachers and admins can add to the record;
 * only admins can edit, delete or remove things (checked in the action too).
 */
import { TopicList } from "~/components/caps/cap-bits";
import type { ReactNode } from "react";
import { Link, data, redirect, useLoaderData } from "react-router";
import { ArrowLeft, FileText, Globe, Mail, Pencil, Phone } from "lucide-react";
import type { Route } from "./+types/app.people.$personId";
import { schoolToday } from "~/components/people/format";
import { IntroPaths } from "~/components/people/intro-paths";
import { ActivityTimeline, CapsList, ConnectionsList, DeletePersonDialog } from "~/components/people/profile-sections";
import { RecordForms, type ProfileActionData } from "~/components/people/record-forms";
import { ContributionChip, PageHeader, Panel, PersonAvatar, Sheet, StatusBadge, TagList } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireAdmin, requireUser } from "~/lib/auth.server";
import { addCapPartner, getCap, getCapsForPerson, listCaps } from "~/lib/caps.server";
import { CONTRIBUTION_TYPES } from "~/lib/constants";
import { query, queryOne } from "~/lib/db.server";
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
} from "~/lib/people.server";

export const meta: Route.MetaFunction = ({ matches, loaderData }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const name = loaderData?.person.full_name ?? t("people.profile.title");
  return [{ title: `${name} | ${t("common.schoolName")}` }];
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const person = await getPerson(params.personId);
  if (!person) throw data(null, { status: 404 });
  const isAdmin = user.role === "admin";

  const [paths, relationships, caps, engagements, allCaps, others, intake] = await Promise.all([
    findIntroPaths(person.id),
    getRelationships(person.id),
    getCapsForPerson(person.id),
    getEngagements(person.id),
    listCaps(),
    query<{ id: string; full_name: string; organization_name: string | null }>(
      `SELECT p.id, p.full_name, o.name AS organization_name
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE p.id <> $1 ORDER BY p.full_name LIMIT 2000`,
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
    today: schoolToday(),
  };
}

const fail = (intent: string, errors: Partial<Record<string, MessageKey>>, status = 400) =>
  data<ProfileActionData>({ ok: false, intent, errors }, { status });
const done = (intent: string) => data<ProfileActionData>({ ok: true, intent });

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const personId = params.personId;
  const exists = await queryOne<{ id: string }>("SELECT id FROM people WHERE id = $1", [personId]);
  if (!exists) throw data(null, { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  switch (intent) {
    case "logEngagement": {
      const parsed = parseEngagementForm(form);
      if (!parsed.ok) return fail(intent, parsed.errors);
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
      const other = await queryOne<{ id: string }>("SELECT id FROM people WHERE id = $1", [relatedPersonId]);
      if (!other) return fail(intent, { _form: "people.error.notFound" });
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

export default function PersonProfile() {
  const { person, paths, relationships, caps, engagements, capOptions, peopleOptions, intakeId, isAdmin, today } =
    useLoaderData<typeof loader>();
  const { t } = useT();
  const notAdded = <p className="text-sm text-smoke">{t("people.profile.notAdded")}</p>;
  const ways = CONTRIBUTION_TYPES.filter((type) => person.contribution_types.includes(type));
  const subtitle =
    person.title && person.organization_name
      ? t("people.profile.atOrg", { title: person.title, org: person.organization_name })
      : (person.title ?? person.organization_name);

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
              <StatusBadge status={person.status} />
              {person.affiliations.map((a) => (
                <span key={a} className="inline-flex h-5 items-center rounded-full border border-stone bg-canvas px-2 text-[0.7rem] text-graphite">
                  {t(`common.affiliation.${a}`)}
                </span>
              ))}
              <span className="text-xs text-smoke">
                {t("people.profile.sourceLine", { source: t(`common.source.${person.source}`) })}
              </span>
            </span>
          </span>
        }
        actions={
          isAdmin && (
            <>
              {intakeId && (
                <Button asChild variant="ghost">
                  <Link to={`/app/admin/intake/${intakeId}`}>
                    <FileText aria-hidden="true" />
                    {t("people.profile.intakeLink")}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to={`/app/people/${person.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  {t("common.action.edit")}
                </Link>
              </Button>
              <DeletePersonDialog name={person.full_name} />
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={t("people.profile.details")} bodyClassName="grid gap-5">
          <DetailBlock label={t("common.field.contributions")}>
            {ways.length ? (
              <div className="flex flex-wrap gap-1.5">
                {ways.map((type) => (
                  <ContributionChip key={type} type={type} long className="h-7 text-sm" />
                ))}
              </div>
            ) : (
              notAdded
            )}
          </DetailBlock>
          <div className="grid gap-5 sm:grid-cols-2">
            <DetailBlock label={t("common.field.skills")}>
              {person.skills.length ? <TagList tags={person.skills} /> : notAdded}
            </DetailBlock>
            <DetailBlock label={t("common.field.capTopics")}>
              {person.cap_topics.length ? <TopicList topics={person.cap_topics} /> : notAdded}
            </DetailBlock>
          </div>
          {(person.funding_focus || person.contribution_types.includes("funder")) && (
            <DetailBlock label={t("common.field.fundingFocus")}>
              {person.funding_focus ? (
                <p className="text-sm leading-relaxed whitespace-pre-line text-graphite">{person.funding_focus}</p>
              ) : (
                notAdded
              )}
            </DetailBlock>
          )}
          <DetailBlock label={t("common.field.availability")}>
            {person.availability ? <p className="text-sm text-graphite">{person.availability}</p> : notAdded}
          </DetailBlock>
          <DetailBlock label={t("common.field.bio")}>
            {person.bio ? <p className="text-sm leading-relaxed whitespace-pre-line text-graphite">{person.bio}</p> : notAdded}
          </DetailBlock>
          <DetailBlock label={t("common.field.notes")}>
            {person.notes ? (
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-sm leading-relaxed whitespace-pre-line text-graphite">{person.notes}</p>
                <p className="mt-2 text-xs text-smoke">{t("people.profile.notesHint")}</p>
              </div>
            ) : (
              notAdded
            )}
          </DetailBlock>
        </Panel>

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
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("people.profile.reachTitle")}>
          <p className="-mt-2 mb-4 text-sm text-smoke">{t("people.profile.reachDescription")}</p>
          <IntroPaths paths={paths} person={person} />
        </Panel>
        <Panel title={t("people.profile.connectionsTitle")}>
          <ConnectionsList relationships={relationships} isAdmin={isAdmin} />
        </Panel>
      </div>

      <Panel title={t("people.profile.recordTitle")}>
        <RecordForms personName={person.full_name} people={peopleOptions} caps={capOptions} today={today} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={t("people.profile.activityTitle")}>
          <ActivityTimeline engagements={engagements} isAdmin={isAdmin} />
        </Panel>
        <Panel title={t("people.profile.capsTitle")} className="h-fit">
          <CapsList caps={caps} />
        </Panel>
      </div>
    </div>
  );
}

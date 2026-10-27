/**
 * One person's profile, in two variants decided on the server.
 *
 * Admin: the full CRM record. Contact details, categories, owner, how the
 * relationship began, status and staff access (editable in place), private
 * notes, opportunities, follow-ups, related staff requests, one merged
 * history, connections, intro paths and "Record an interaction".
 *
 * Staff: only what staff may see (summary, ways to help, skills, CAPs,
 * organization, title, location, availability), contact details only when the
 * person is direct-contact, Contact / Request Introduction / Save, the shared
 * history, their own requests about this person, and logging of the work
 * itself. A person hidden from staff is a 404, exactly like a missing one.
 *
 * Every write intent checks the role here on the server; hiding a button is
 * never the only guard. Deleting a person happens from the edit page but posts here.
 */
import { TopicList } from "~/components/caps/cap-bits";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, data, redirect, useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { ArrowLeft, Globe, Lock, Mail, MapPin, MoreHorizontal, NotebookPen, Pencil, Phone, Plus } from "lucide-react";
import type { Route } from "./+types/app.people.$personId";
import { OpportunitiesPanel, FollowUpsPanel } from "~/components/crm";
import { IntroPaths } from "~/components/people/intro-paths";
import { CapsList, ConnectionsList, HistoryTimeline } from "~/components/people/profile-sections";
import { CapForm, ConnectionForm, LogActivityForm, type ProfileActionData } from "~/components/people/record-forms";
import { RequestsPanel } from "~/components/requests";
import { ResourceActions } from "~/components/resources/resource-actions";
import { ContributionChip, PageHeader, Panel, PersonAvatar, Sheet, TagList } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { makeT, useT, type MessageKey } from "~/i18n";
import { requireAdmin, requireUser } from "~/lib/auth.server";
import { addCapPartner, canManagePartners, getCap, getCapsForPerson, listCaps } from "~/lib/caps.server";
import {
  ADMIN_LOGGABLE_KINDS,
  CONTACT_MODES,
  CONTRIBUTION_TYPES,
  INNER_CIRCLE,
  PERSON_STATUSES,
  STAFF_LOGGABLE_KINDS,
  type ContactMode,
  type PersonStatus,
} from "~/lib/constants";
import { schoolToday } from "~/lib/dates";
import { query, queryOne } from "~/lib/db.server";
import { getPersonCrm } from "~/lib/follow-ups.server";
import { listHistory } from "~/lib/history.server";
import { canViewPerson, isAdmin as isAdminViewer, visibleToSql } from "~/lib/permissions.server";
import {
  parseCapPartnerForm,
  parseConnectionForm,
  parseEngagementForm,
  parseTargetId,
  parseVisibilityForm,
} from "~/lib/people-form.server";
import {
  addRelationship,
  deleteEngagement,
  deletePerson,
  findIntroPaths,
  getPerson,
  getRelationships,
  logEngagement,
  removeRelationship,
  updatePerson,
  type PersonView,
} from "~/lib/people.server";
import { listRequestsForPerson } from "~/lib/requests.server";
import { isSaved } from "~/lib/saved.server";
import { capitalizeFirst, formatDate } from "~/components/people/format";
import { cn } from "~/lib/utils";

export const meta: Route.MetaFunction = ({ matches, loaderData }) => {
  const locale = (matches[0]?.data as { locale?: "en" | "es" } | undefined)?.locale ?? "en";
  const t = makeT(locale);
  const name = loaderData?.person.full_name ?? t("people.profile.title");
  return [{ title: `${name} | ${t("common.schoolName")}` }];
};

/**
 * Exactly the fields staff may see. Built field by field (never spread) so a
 * new private column on PersonView can't leak into the staff loader data.
 */
function staffPerson(p: PersonView) {
  const direct = p.contact_mode === "direct";
  return {
    id: p.id,
    full_name: p.full_name,
    title: p.title,
    organization_name: p.organization_name,
    location: p.location,
    availability: p.availability,
    preferred_language: p.preferred_language,
    contribution_types: p.contribution_types,
    skills: p.skills,
    cap_topics: p.cap_topics,
    contact_mode: p.contact_mode,
    email: direct ? p.email : null,
    phone: direct ? p.phone : null,
    // The admin's summary for staff; the person's own public "about" if there is none yet.
    summary: p.shared_summary ?? p.bio,
  };
}

/** Which of these history entries a staff member recorded (shown as "Logged by staff"). */
async function staffAuthoredIds(personId: string, entryIds: string[]): Promise<string[]> {
  if (!entryIds.length) return [];
  const rows = await query<{ id: string }>(
    `SELECT e.id FROM engagements e JOIN users u ON u.id = e.user_id
      WHERE e.person_id = $1 AND u.role = 'staff' AND e.id = ANY($2::text[])`,
    [personId, entryIds],
  );
  return rows.map((r) => r.id);
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  // Hidden from this viewer looks the same as missing.
  const person = await getPerson(params.personId, user);
  if (!person) throw data(null, { status: 404 });
  const today = schoolToday();

  const [caps, history, requests, allCaps] = await Promise.all([
    getCapsForPerson(person.id),
    listHistory(person.id, user),
    listRequestsForPerson(user, person.id),
    listCaps(),
  ]);
  const staffAuthored = await staffAuthoredIds(
    person.id,
    history.map((h) => h.id),
  );
  const capOptions = allCaps.map((c) => ({ value: c.id, label: c.title }));

  if (!isAdminViewer(user)) {
    return {
      view: "staff" as const,
      person: staffPerson(person),
      caps,
      history,
      staffAuthored,
      requests,
      saved: await isSaved(user, person.id),
      capOptions,
      logKinds: STAFF_LOGGABLE_KINDS as readonly (typeof STAFF_LOGGABLE_KINDS)[number][],
      today,
    };
  }

  const [paths, relationships, crm, others, intake, firstEntry] = await Promise.all([
    findIntroPaths(person.id, user),
    getRelationships(person.id, user),
    getPersonCrm(user, person.id, { today }),
    query<{ id: string; full_name: string; organization_name: string | null }>(
      `SELECT p.id, p.full_name, o.name AS organization_name
         FROM people p LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE p.id <> $1 AND ${visibleToSql(user, "p")} ORDER BY p.full_name LIMIT 2000`,
      [person.id],
    ),
    queryOne<{ id: string }>("SELECT id FROM intake_submissions WHERE person_id = $1 ORDER BY submitted_at DESC LIMIT 1", [
      person.id,
    ]),
    // The earliest history date and who added the contact, so "Added" agrees with the history.
    queryOne<{ first_on: string | null; created_by: string | null }>(
      `SELECT (SELECT min(happened_on)::text FROM engagements WHERE person_id = $1) AS first_on,
              (SELECT u.name FROM engagements e JOIN users u ON u.id = e.user_id
                WHERE e.person_id = $1 AND e.kind = 'contact_created'
                ORDER BY e.happened_on, e.created_at LIMIT 1) AS created_by`,
      [person.id],
    ),
  ]);
  const createdOn = schoolDateOf(person.created_at);
  const firstOn = firstEntry?.first_on?.slice(0, 10) ?? null;

  return {
    view: "admin" as const,
    person,
    added: {
      on: firstOn && (!createdOn || firstOn < createdOn) ? firstOn : (createdOn ?? firstOn),
      by: firstEntry?.created_by ?? person.owner_name ?? null,
    },
    paths,
    relationships,
    caps,
    history,
    staffAuthored,
    requests,
    crm,
    capOptions,
    peopleOptions: others.map((p) => ({
      value: p.id,
      label: p.organization_name ? `${p.full_name}, ${p.organization_name}` : p.full_name,
    })),
    intakeId: intake?.id ?? null,
    logKinds: ADMIN_LOGGABLE_KINDS as readonly (typeof ADMIN_LOGGABLE_KINDS)[number][],
    today,
  };
}

/** A timestamp as the school's calendar date (YYYY-MM-DD). */
function schoolDateOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : schoolToday(date);
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
      await requireAdmin(request);
      const parsed = parseConnectionForm(form);
      if (!parsed.ok) return fail(intent, parsed.errors);
      const { relatedPersonId, kind, note } = parsed.value;
      if (relatedPersonId === personId) return fail(intent, { related_person_id: "people.error.person" });
      if (!(await canViewPerson(user, relatedPersonId))) return fail(intent, { _form: "people.error.notFound" });
      await addRelationship({ personId, relatedPersonId, kind, note, source: "admin" }, user.id);
      return done(intent);
    }

    case "addToCap": {
      // Only admins add CAP partners (staff ask through a request instead).
      if (!canManagePartners(user)) return fail(intent, { _form: "people.error.unknownAction" }, 403);
      const parsed = parseCapPartnerForm(form);
      if (!parsed.ok) return fail(intent, parsed.errors);
      if (!(await getCap(parsed.value.capId))) return fail(intent, { _form: "people.error.notFound" });
      await addCapPartner({ capId: parsed.value.capId, personId, role: parsed.value.role }, user.id);
      return done(intent);
    }

    case "deleteEngagement": {
      await requireAdmin(request);
      const targetId = parseTargetId(form);
      // Only entries typed by hand; synced email and app-made entries stay as the record.
      const row =
        targetId &&
        (await queryOne<{ id: string }>(
          "SELECT id FROM engagements WHERE id = $1 AND person_id = $2 AND origin = 'manual'",
          [targetId, personId],
        ));
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

    case "setVisibility": {
      await requireAdmin(request);
      const parsed = parseVisibilityForm(form);
      if (!parsed.ok) return fail(intent, { _form: "people.error.unknownAction" });
      await updatePerson(personId, parsed.value);
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

// ---------- small pieces ----------

function DetailBlock({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <h3 className="text-eyebrow text-smoke">{label}</h3>
      {children}
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed whitespace-pre-line text-graphite">{children}</p>;
}

/** Shows "Saved" for a moment after each successful fetcher save of this intent. */
function useSavedFlash(fetcher: ReturnType<typeof useFetcher<ProfileActionData>>, intent: string) {
  const result = fetcher.state === "idle" && fetcher.data?.intent === intent ? fetcher.data : null;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!result?.ok) return;
    setShow(true);
    const timer = window.setTimeout(() => setShow(false), 2000);
    return () => window.clearTimeout(timer);
  }, [result]);
  const error = result && !result.ok ? (result.errors._form ?? "common.state.error") : null;
  return { show, error };
}

/** Admins change status right in the header; it saves as soon as it changes. */
function StatusSelect({ status }: { status: PersonStatus }) {
  const { t } = useT();
  const fetcher = useFetcher<ProfileActionData>();
  const current = (fetcher.formData?.get("status") as PersonStatus | null) ?? status;
  const { show, error } = useSavedFlash(fetcher, "setStatus");
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
        {show ? t("people.profile.statusSaved") : ""}
      </span>
      {error && (
        <span role="alert" className="text-xs text-rust-ink">
          {t(error)}
        </span>
      )}
    </span>
  );
}

/** Staff access, edited in place: in the staff directory or not, and direct contact or introduction. */
function AccessControls({ visible, mode }: { visible: boolean; mode: ContactMode }) {
  const { t } = useT();
  const fetcher = useFetcher<ProfileActionData>();
  const pending = fetcher.formData;
  const currentVisible = pending ? pending.get("directory_visible") === "true" : visible;
  const currentMode = ((pending?.get("contact_mode") as ContactMode | null) ?? mode) as ContactMode;
  const { show, error } = useSavedFlash(fetcher, "setVisibility");
  const save = (next: { directory_visible: boolean; contact_mode: ContactMode }) =>
    fetcher.submit(
      { intent: "setVisibility", directory_visible: String(next.directory_visible), contact_mode: next.contact_mode },
      { method: "post" },
    );
  return (
    <div className="grid gap-3">
      <label htmlFor="access-visible" className="flex cursor-pointer items-start gap-3">
        <Checkbox
          id="access-visible"
          checked={currentVisible}
          onCheckedChange={(on) => save({ directory_visible: on === true, contact_mode: currentMode })}
          className="mt-0.5"
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium text-ink">{t("common.field.directoryVisible")}</span>
          <span className="text-xs text-smoke">
            {currentVisible ? t("people.profile.visibleOn") : t("people.profile.visibleOff")}
          </span>
        </span>
      </label>
      <div className="grid gap-1.5">
        <span id="access-mode-label" className="text-xs text-smoke">
          {t("people.profile.contactModeLabel")}
        </span>
        <Select
          value={currentMode}
          onValueChange={(value) => save({ directory_visible: currentVisible, contact_mode: value as ContactMode })}
        >
          <SelectTrigger aria-labelledby="access-mode-label" className="h-9 w-full bg-canvas text-sm">
            <SelectValue>{t(`common.contactMode.${currentMode}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CONTACT_MODES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`common.contactMode.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-smoke">{t(`common.contactModeHelp.${currentMode}`)}</p>
      </div>
      <p role="status" className="min-h-4 text-xs text-sage-ink">
        {show ? t("people.profile.accessSaved") : ""}
      </p>
      {error && (
        <p role="alert" className="text-xs text-rust-ink">
          {t(error)}
        </p>
      )}
    </div>
  );
}

/** Anchors that open the log box: #log-activity (dashboard, CAP partners) and #record (older links). */
const LOG_HASHES = new Set(["#log-activity", "#record"]);

/**
 * The "Record an interaction" / "Log work with students" form. Hidden until a
 * button elsewhere links to #log-activity (the header button for admins, the
 * History action for staff); also opens on its own for ?logCap from a CAP.
 */
function LogBox({ title, startOpen, children }: { title: string; startOpen: boolean; children: ReactNode }) {
  const { t } = useT();
  const { hash } = useLocation();
  const [open, setOpen] = useState(startOpen || LOG_HASHES.has(hash));
  const box = useRef<HTMLDivElement>(null);
  const openAndShow = () => {
    setOpen(true);
    window.requestAnimationFrame(() => box.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  useEffect(() => {
    if (LOG_HASHES.has(hash)) openAndShow();
  }, [hash]);
  useEffect(() => {
    const onHash = () => {
      if (LOG_HASHES.has(window.location.hash)) openAndShow();
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const close = () => {
    setOpen(false);
    // Drop the anchor so the button can open the box again.
    if (LOG_HASHES.has(window.location.hash)) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  };

  if (!open) return <div id="log-activity" ref={box} className="absolute scroll-mt-24" />;
  return (
    <div id="log-activity" ref={box} className="grid scroll-mt-24 gap-3 rounded-xl bg-canvas p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <Button variant="ghost" size="xs" aria-expanded onClick={close}>
          {t("common.action.close")}
        </Button>
      </div>
      {children}
    </div>
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

const linkClass = "text-ink underline decoration-stone underline-offset-4 hover:decoration-gold";
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

function ContactLines({ name, email, phone }: { name: string; email: string | null; phone: string | null }) {
  const { t } = useT();
  return (
    <ul className="grid gap-2 text-sm">
      {email && (
        <li>
          <a href={`mailto:${email}`} aria-label={t("people.profile.emailThem", { name })} className={cn("flex items-center gap-2 break-all", linkClass)}>
            <Mail className="size-4 shrink-0 text-smoke" aria-hidden="true" />
            {email}
          </a>
        </li>
      )}
      {phone && (
        <li>
          <a href={telHref(phone)} aria-label={t("people.profile.callThem", { name })} className={cn("flex items-center gap-2", linkClass)}>
            <Phone className="size-4 shrink-0 text-smoke" aria-hidden="true" />
            {phone}
          </a>
        </li>
      )}
    </ul>
  );
}

const addLinkClass =
  "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full text-xs font-medium text-graphite underline decoration-stone underline-offset-4 hover:text-ink hover:decoration-gold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none max-md:min-h-10";

/** An empty side section as one muted line: "Requests  None yet  + New request". */
function EmptyLine({ title, action }: { title: string; action?: ReactNode }) {
  const { t } = useT();
  return (
    <li className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
      <p className="text-sm text-smoke">
        <span className="font-medium text-graphite">{title}</span>
        <span className="sr-only">:</span> <span className="ml-1.5">{t("people.profile.noneYet")}</span>
      </p>
      {action}
    </li>
  );
}

/**
 * Empty CRM sections as one quiet line: "Add: opportunity · request · CAP · connection".
 * Opportunity and request open their forms; CAP and connection open a small form underneath.
 */
function AddLine({
  personId,
  opportunity,
  request,
  cap,
  connection,
}: {
  personId: string;
  opportunity: boolean;
  request: boolean;
  cap: ReactNode;
  connection: ReactNode;
}) {
  const { t } = useT();
  const [open, setOpen] = useState<"cap" | "connection" | null>(null);
  const person = encodeURIComponent(personId);
  const items: ReactNode[] = [];
  if (opportunity)
    items.push(
      <Link key="opp" to={`/app/opportunities/new?person=${person}`} className={addLinkClass}>
        {t("people.profile.addOpportunityShort")}
      </Link>,
    );
  if (request)
    items.push(
      <Link key="req" to={`/app/requests/new?person=${person}`} className={addLinkClass}>
        {t("people.profile.addRequestShort")}
      </Link>,
    );
  const toggle = (which: "cap" | "connection", label: string) => (
    <button
      key={which}
      type="button"
      aria-expanded={open === which}
      onClick={() => setOpen((cur) => (cur === which ? null : which))}
      className={cn(addLinkClass, open === which && "text-ink decoration-gold")}
    >
      {label}
    </button>
  );
  if (cap) items.push(toggle("cap", t("people.profile.addCapShort")));
  if (connection) items.push(toggle("connection", t("people.profile.addConnectionShort")));

  return (
    <div className="grid gap-3 rounded-card bg-taupe px-5 py-2.5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-smoke">
        <span className="inline-flex items-center gap-1 font-medium text-graphite">
          <Plus className="size-3.5" aria-hidden="true" />
          {t("people.profile.addLabel")}
        </span>
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">·</span>}
            {item}
          </span>
        ))}
      </p>
      {open === "cap" && cap && (
        <div id="add-cap" className="pb-2">
          {cap}
        </div>
      )}
      {open === "connection" && connection && (
        <div id="add-connection" className="pb-2">
          {connection}
        </div>
      )}
    </div>
  );
}

function BackLink() {
  const { t } = useT();
  return (
    <Link
      to="/app/people"
      className="inline-flex w-fit items-center gap-1.5 rounded-full text-sm text-smoke hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t("people.profile.backToPeople")}
    </Link>
  );
}

function ProfileTitle({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-4">
      <PersonAvatar name={name} className="size-14 text-base" />
      <span className="min-w-0 break-words">{name}</span>
    </span>
  );
}

type HelpPerson = { contribution_types: PersonView["contribution_types"]; skills: string[]; cap_topics: string[]; availability: string | null };

/** Whether HelpDetails has anything to show (so an empty "About them" can disappear). */
function hasHelpDetails(person: HelpPerson, showTopics: boolean): boolean {
  return Boolean(
    person.contribution_types.length || person.skills.length || (showTopics && person.cap_topics.length) || person.availability,
  );
}

/**
 * Ways to help, skills, CAP topics (admins only) and availability: the part both
 * variants share. Empty parts are left out.
 */
function HelpDetails({ person, showTopics }: { person: HelpPerson; showTopics: boolean }) {
  const { t } = useT();
  const ways = CONTRIBUTION_TYPES.filter((type) => person.contribution_types.includes(type));
  const topics = showTopics ? person.cap_topics : [];
  return (
    <>
      {ways.length > 0 && (
        <DetailBlock label={t("common.field.contributions")}>
          <div className="flex flex-wrap gap-1.5">
            {ways.map((type) => (
              <ContributionChip key={type} type={type} long className="h-7 text-sm" />
            ))}
          </div>
        </DetailBlock>
      )}
      {(person.skills.length > 0 || topics.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          {person.skills.length > 0 && (
            <DetailBlock label={t("common.field.skills")}>
              <TagList tags={person.skills.map(capitalizeFirst)} />
            </DetailBlock>
          )}
          {topics.length > 0 && (
            <DetailBlock label={t("common.field.capTopics")}>
              <TopicList topics={topics} />
            </DetailBlock>
          )}
        </div>
      )}
      {person.availability && (
        <DetailBlock label={t("common.field.availability")}>
          <Prose>{person.availability}</Prose>
        </DetailBlock>
      )}
    </>
  );
}

function subtitleOf(t: ReturnType<typeof useT>["t"], person: { title: string | null; organization_name: string | null }) {
  return person.title && person.organization_name
    ? t("people.profile.atOrg", { title: person.title, org: person.organization_name })
    : (person.title ?? person.organization_name);
}

// ---------- the page ----------

export default function PersonProfile() {
  const loaderData = useLoaderData<typeof loader>();
  return loaderData.view === "admin" ? <AdminProfile data={loaderData} /> : <StaffProfile data={loaderData} />;
}

type LoaderData = ReturnType<typeof useLoaderData<typeof loader>>;
type AdminData = Extract<LoaderData, { view: "admin" }>;
type StaffData = Extract<LoaderData, { view: "staff" }>;

function useDefaultCap(capOptions: { value: string }[]) {
  const [searchParams] = useSearchParams();
  const logCap = searchParams.get("logCap");
  return logCap && capOptions.some((c) => c.value === logCap) ? logCap : undefined;
}

function AdminProfile({ data: d }: { data: AdminData }) {
  const { t, locale } = useT();
  const { person } = d;
  const defaultCap = useDefaultCap(d.capOptions);
  const subtitle = subtitleOf(t, person);
  // "Added by staff" says nothing the name doesn't; other sources (sign-up form, referral...) still show.
  const sourceLine =
    person.source && person.source !== "admin"
      ? t("people.profile.sourceLine", { source: t(`common.source.${person.source}`) })
      : null;
  const addedDate = formatDate(d.added.on, locale);
  const addedLine = d.added.by
    ? `${t("people.profile.addedBy", { name: d.added.by })}${addedDate ? ` · ${addedDate}` : ""}`
    : addedDate
      ? t("people.profile.addedOn", { date: addedDate })
      : null;
  const reachEmpty = d.paths.length === 0 && !person.affiliations.some((a) => INNER_CIRCLE.includes(a));
  const empties = {
    opportunities: d.crm.opportunities.length === 0,
    requests: d.requests.length === 0,
    caps: d.caps.length === 0,
    connections: d.relationships.length === 0,
  };
  const showAbout =
    hasHelpDetails(person, true) || Boolean(person.shared_summary || person.bio || person.funding_focus || person.notes);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <BackLink />
      <PageHeader
        title={<ProfileTitle name={person.full_name} />}
        description={
          <span className="grid gap-2.5">
            {subtitle && <span className="text-graphite">{subtitle}</span>}
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusSelect status={person.status} />
              {person.affiliations.map((a) => (
                <span key={a} className="inline-flex h-5 items-center rounded-full border border-stone bg-canvas px-2 text-[0.7rem] text-graphite">
                  {t(`common.affiliation.${a}`)}
                </span>
              ))}
              {!person.directory_visible && (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-stone px-2 text-[0.7rem] text-graphite">
                  <Lock className="size-3" aria-hidden="true" />
                  {t("people.profile.visibleOff")}
                </span>
              )}
            </span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="brand" className="max-md:h-10">
              <a href="#log-activity">
                <NotebookPen aria-hidden="true" />
                {t("people.profile.record")}
              </a>
            </Button>
            <Button asChild variant="outline" className="max-md:h-10">
              <Link to={`/app/people/${person.id}/email`}>
                <Mail aria-hidden="true" />
                {t("people.profile.actionEmail")}
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="max-md:size-10" aria-label={t("people.profile.moreActions", { name: person.full_name })}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40">
                {person.phone && (
                  <DropdownMenuItem asChild>
                    <a href={telHref(person.phone)}>
                      <Phone aria-hidden="true" />
                      {t("people.profile.actionCall")}
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to={`/app/people/${person.id}/edit`}>
                    <Pencil aria-hidden="true" />
                    {t("common.action.edit")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          {showAbout && (
          <Panel title={t("people.profile.details")} bodyClassName="grid gap-5">
            <HelpDetails person={person} showTopics />
            {person.shared_summary && (
              <DetailBlock label={t("common.field.sharedSummary")}>
                <Prose>{person.shared_summary}</Prose>
              </DetailBlock>
            )}
            {person.bio && (
              <DetailBlock label={t("common.field.bio")}>
                <Prose>{person.bio}</Prose>
              </DetailBlock>
            )}
            {person.funding_focus && (
              <DetailBlock label={t("common.field.fundingFocus")}>
                <Prose>{person.funding_focus}</Prose>
              </DetailBlock>
            )}
            {person.notes && (
              <DetailBlock
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3" aria-hidden="true" />
                    {t("people.profile.privateNotes")} · {t("people.profile.adminsOnly")}
                  </span>
                }
              >
                <p className="rounded-xl bg-canvas p-3 text-sm leading-relaxed whitespace-pre-line text-graphite">{person.notes}</p>
              </DetailBlock>
            )}
          </Panel>
          )}

          {!empties.opportunities && (
            <OpportunitiesPanel personId={person.id} opportunities={d.crm.opportunities} today={d.crm.today} />
          )}
          <FollowUpsPanel
            personId={person.id}
            followUps={d.crm.followUps}
            today={d.crm.today}
            opportunities={d.crm.opportunities}
            owners={d.crm.owners}
          />

          <Panel title={t("people.profile.historyTitle")} bodyClassName="grid gap-6">
            <LogBox title={t("people.profile.record")} startOpen={Boolean(defaultCap)}>
              <LogActivityForm
                caps={d.capOptions}
                today={d.today}
                defaultCap={defaultCap}
                kinds={d.logKinds}
                defaultKind="note"
                submitLabel={t("common.action.save")}
                savedLabel={t("people.profile.recordSaved")}
              />
            </LogBox>
            <HistoryTimeline engagements={d.history} isAdmin personId={person.id} staffAuthored={d.staffAuthored} />
          </Panel>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <Sheet className="grid h-fit gap-4">
            <h2 className="text-section">{t("people.profile.contact")}</h2>
            {person.email || person.phone ? (
              <ContactLines name={person.full_name} email={person.email} phone={person.phone} />
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
              {person.location && (
                <div>
                  <dt className="text-xs text-smoke">{t("common.field.location")}</dt>
                  <dd className="text-graphite">{person.location}</dd>
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
                      className={cn("inline-flex items-center gap-1.5 break-all", linkClass)}
                    >
                      <Globe className="size-4 shrink-0 text-smoke" aria-hidden="true" />
                      {person.organization_website.replace(/^https?:\/\//i, "")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Sheet>

          <Sheet className="grid h-fit gap-4">
            <h2 className="text-section">{t("people.profile.relationshipTitle")}</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-smoke">{t("common.field.categories")}</dt>
                <dd className="mt-1">
                  {person.categories.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {person.categories.map((c) => (
                        <span key={c} className="inline-flex h-6 items-center rounded-full border border-stone bg-canvas px-2.5 text-xs text-graphite">
                          {t(`common.category.${c}`)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-smoke">{t("people.profile.categoriesNone")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-smoke">{t("common.field.owner")}</dt>
                <dd className={person.owner_name ? "text-graphite" : "text-smoke"}>{person.owner_name ?? t("people.profile.ownerNone")}</dd>
              </div>
              <div>
                <dt className="text-xs text-smoke">{t("common.field.origin")}</dt>
                <dd className={cn("whitespace-pre-line", person.origin ? "text-graphite" : "text-smoke")}>
                  {person.origin ?? t("people.profile.originNone")}
                </dd>
              </div>
            </dl>
            {(addedLine || sourceLine) && (
              <p className="-mt-1 text-xs text-smoke">
                {addedLine}
                {sourceLine && (
                  <>
                    {addedLine && " · "}
                    {d.intakeId ? (
                      <Link
                        to={`/app/admin/intake/${d.intakeId}`}
                        className="underline decoration-stone underline-offset-4 hover:text-ink hover:decoration-gold"
                      >
                        {sourceLine}
                      </Link>
                    ) : (
                      sourceLine
                    )}
                  </>
                )}
              </p>
            )}
            <div className="grid gap-3 border-t border-stone pt-4">
              <h3 className="text-eyebrow text-smoke">{t("people.profile.accessTitle")}</h3>
              <AccessControls visible={person.directory_visible} mode={person.contact_mode} />
            </div>
          </Sheet>

          {!empties.requests && <RequestsPanel personId={person.id} requests={d.requests} showRequester />}

          {!empties.caps && (
            <Panel title={t("people.profile.capsTitle")}>
              <CapsList caps={d.caps} />
              <AddToggle label={t("people.profile.addToCap")}>
                <CapForm caps={d.capOptions} />
              </AddToggle>
            </Panel>
          )}

          {!empties.connections && (
            <Panel title={t("people.profile.connectionsTitle")}>
              <ConnectionsList relationships={d.relationships} isAdmin />
              <AddToggle label={t("people.profile.addConnection")}>
                <ConnectionForm people={d.peopleOptions} personName={person.full_name} />
              </AddToggle>
            </Panel>
          )}

          {!reachEmpty && (
            <Panel title={t("people.profile.reachTitle")}>
              <IntroPaths paths={d.paths} person={person} />
            </Panel>
          )}

          {(empties.opportunities || empties.requests || empties.caps || empties.connections) && (
            <AddLine
              personId={person.id}
              opportunity={empties.opportunities}
              request={empties.requests}
              cap={empties.caps ? <CapForm caps={d.capOptions} /> : null}
              connection={empties.connections ? <ConnectionForm people={d.peopleOptions} personName={person.full_name} /> : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StaffProfile({ data: d }: { data: StaffData }) {
  const { t } = useT();
  const { person } = d;
  const defaultCap = useDefaultCap(d.capOptions);
  const subtitle = subtitleOf(t, person);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <BackLink />
      <PageHeader
        title={<ProfileTitle name={person.full_name} />}
        description={
          <span className="grid gap-1.5">
            {subtitle && <span className="text-graphite">{subtitle}</span>}
            {person.location && (
              <span className="inline-flex items-center gap-1.5 text-sm text-smoke">
                <MapPin className="size-4" aria-hidden="true" />
                {person.location}
              </span>
            )}
          </span>
        }
        actions={<ResourceActions person={person} saved={d.saved} />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          {(person.summary || hasHelpDetails(person, false)) && (
            <Panel title={t("people.profile.details")} bodyClassName="grid gap-5">
              {person.summary && <Prose>{person.summary}</Prose>}
              <HelpDetails person={person} showTopics={false} />
            </Panel>
          )}

          {/* With no visits yet, the requests come first and History is just its "Log work" action. */}
          {d.history.length === 0 && d.requests.length > 0 && <RequestsPanel personId={person.id} requests={d.requests} />}

          <Panel
            title={t("people.profile.historyTitle")}
            bodyClassName="grid gap-6"
            action={
              <Button asChild variant="outline" size="sm" className="max-md:h-10">
                <a href="#log-activity">
                  <Plus aria-hidden="true" />
                  {t("people.profile.logWork")}
                </a>
              </Button>
            }
          >
            <LogBox title={t("people.profile.logWork")} startOpen={Boolean(defaultCap)}>
              <LogActivityForm caps={d.capOptions} today={d.today} defaultCap={defaultCap} kinds={d.logKinds} />
            </LogBox>
            {/* With a request about this person, "no visits yet" would read as "nothing happened". */}
            {(d.history.length > 0 || d.requests.length === 0) && (
              <HistoryTimeline
                engagements={d.history}
                isAdmin={false}
                personId={person.id}
                staffAuthored={d.staffAuthored}
                emptyLabel={t("people.profile.historyStaffEmpty")}
              />
            )}
          </Panel>

          {d.history.length > 0 && d.requests.length > 0 && <RequestsPanel personId={person.id} requests={d.requests} />}
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <Sheet className="grid h-fit gap-4">
            <h2 className="text-section">{t("people.profile.contact")}</h2>
            {person.email || person.phone ? (
              <ContactLines name={person.full_name} email={person.email} phone={person.phone} />
            ) : (
              <p className="text-sm text-smoke">
                {person.contact_mode === "introduction" ? t("people.profile.introOnly") : t("people.profile.noContact")}
              </p>
            )}
            <dl className="grid gap-3 border-t border-stone pt-4 text-sm">
              <div>
                <dt className="text-xs text-smoke">{t("common.field.language")}</dt>
                <dd className="text-graphite">{t(`common.language.${person.preferred_language}`)}</dd>
              </div>
              {person.organization_name && (
                <div>
                  <dt className="text-xs text-smoke">{t("common.field.organization")}</dt>
                  <dd className="text-graphite">{person.organization_name}</dd>
                </div>
              )}
            </dl>
          </Sheet>

          {d.caps.length > 0 ? (
            <Panel title={t("people.profile.capsTitle")}>
              <CapsList caps={d.caps} />
            </Panel>
          ) : null}

          {d.requests.length === 0 && (
            <ul className="grid rounded-card bg-taupe px-5 py-1.5">
              <EmptyLine
                title={t("requests.panel.title")}
                action={
                  <Link to={`/app/requests/new?person=${encodeURIComponent(person.id)}`} className={addLinkClass}>
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t("requests.panel.new")}
                  </Link>
                }
              />
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

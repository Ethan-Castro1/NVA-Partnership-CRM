/**
 * Directory results. Every result shows why it matched ("Why: ...") and the
 * resource actions (View Profile, Contact or Request Introduction, Save).
 *
 * Staff: cards, two across on wide screens. Admins: a CRM table on wide
 * screens (categories, status, staff access) and the same cards on phones,
 * so nothing scrolls sideways at 375px.
 */
import { Link } from "react-router";
import { EyeOff, Languages } from "lucide-react";
import { ContributionChips, PersonAvatar, Sheet, StatusBadge, TagList } from "~/components/nva";
import { MatchReasons } from "~/components/resources/match-reasons";
import { ResourceActions } from "~/components/resources/resource-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useT } from "~/i18n";
import type { SearchHit } from "~/lib/people.server";
import { cn } from "~/lib/utils";

/** Matched skills first so the highlighted ones survive the "max" cut. */
function skillsForRow(person: SearchHit): string[] {
  const matched = person.skills.filter((s) => person.matched.includes(s));
  return [...matched, ...person.skills.filter((s) => !person.matched.includes(s))];
}

function Subtitle({ person }: { person: SearchHit }) {
  const { t } = useT();
  const text =
    person.title && person.organization_name
      ? t("directory.atOrg", { title: person.title, org: person.organization_name })
      : (person.title ?? person.organization_name);
  return text ? <span className="block truncate text-xs text-smoke">{text}</span> : null;
}

function LanguagePill({ language }: { language: SearchHit["preferred_language"] }) {
  const { t } = useT();
  if (language === "en") return null;
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-blue-soft px-2 text-xs text-blue-ink">
      <Languages className="size-3.5" aria-hidden="true" />
      {t(`common.language.${language}`)}
    </span>
  );
}

/** Email and phone, above the row's full-width link so they stay clickable. */
function ContactLinks({ person }: { person: SearchHit }) {
  if (!person.email && !person.phone) return null;
  return (
    <div className="grid min-w-0 gap-0.5">
      {person.email && (
        <a
          href={`mailto:${person.email}`}
          className="relative z-10 block max-w-[220px] truncate text-sm text-ink underline decoration-stone underline-offset-4 hover:decoration-gold"
        >
          {person.email}
        </a>
      )}
      {person.phone && (
        <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="relative z-10 w-fit text-xs text-smoke hover:text-ink">
          {person.phone}
        </a>
      )}
    </div>
  );
}

function CategoryList({ person, className }: { person: SearchHit; className?: string }) {
  const { t } = useT();
  if (!person.categories.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {person.categories.map((c) => (
        <li key={c} className="rounded-full border border-stone bg-canvas px-2 py-0.5 text-xs text-graphite">
          {t(`common.category.${c}`)}
        </li>
      ))}
    </ul>
  );
}

/** Admins: whether staff can see this person, and how they reach them. */
function AccessBadge({ person }: { person: SearchHit }) {
  const { t } = useT();
  if (!person.directory_visible) {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-full bg-taupe px-2 text-xs whitespace-nowrap text-smoke">
        <EyeOff className="size-3.5" aria-hidden="true" />
        {t("directory.hidden")}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-stone bg-canvas px-2 text-xs whitespace-nowrap text-graphite">
      {t("directory.shown")} · {person.contact_mode === "direct" ? t("directory.modeDirect") : t("directory.modeIntro")}
    </span>
  );
}

function NameLink({ person, className }: { person: SearchHit; className?: string }) {
  return (
    <Link
      to={`/app/people/${person.id}`}
      prefetch="intent"
      className={cn(
        "block truncate font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none",
        className,
      )}
    >
      {person.full_name}
    </Link>
  );
}

/** Admins reach anyone directly; the introduction setting is for staff. */
function actionPerson(person: SearchHit, isAdmin: boolean): SearchHit {
  return isAdmin ? { ...person, contact_mode: "direct" } : person;
}

/** One result as a card: used for staff everywhere and for admins on phones. */
function ResultCard({ person, saved, isAdmin }: { person: SearchHit; saved: boolean; isAdmin: boolean }) {
  return (
    <Sheet className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 p-4 focus-within:ring-3 focus-within:ring-ring/50">
      <div className="flex items-start gap-3">
        <PersonAvatar name={person.full_name} />
        <div className="min-w-0 flex-1">
          <NameLink person={person} className="after:rounded-card" />
          <Subtitle person={person} />
          {isAdmin && <ContactLinks person={person} />}
        </div>
        {isAdmin && <StatusBadge status={person.status} />}
      </div>
      <ContributionChips types={person.contribution_types} />
      {isAdmin && <CategoryList person={person} />}
      <TagList tags={skillsForRow(person)} highlight={person.matched} max={4} />
      <MatchReasons reasons={person.reasons} />
      {(isAdmin || person.preferred_language !== "en") && (
        <div className="flex flex-wrap items-center gap-2">
          <LanguagePill language={person.preferred_language} />
          {isAdmin && <AccessBadge person={person} />}
        </div>
      )}
      <ResourceActions person={actionPerson(person, isAdmin)} saved={saved} compact className="mt-auto" />
    </Sheet>
  );
}

export function PeopleResults({
  people,
  savedIds,
  isAdmin,
}: {
  people: SearchHit[];
  savedIds: readonly string[];
  isAdmin: boolean;
}) {
  const { t } = useT();
  const saved = new Set(savedIds);

  const cards = (
    <ul className={cn("grid grid-cols-[minmax(0,1fr)] gap-3", isAdmin ? "md:hidden" : "md:grid-cols-2")}>
      {people.map((person) => (
        <li key={person.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
          <ResultCard person={person} saved={saved.has(person.id)} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  );
  if (!isAdmin) return cards;

  return (
    <>
      <Sheet className="hidden p-0 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-xs font-medium text-smoke">{t("directory.colPerson")}</TableHead>
              <TableHead className="text-xs font-medium text-smoke">{t("directory.colContact")}</TableHead>
              <TableHead className="hidden text-xs font-medium text-smoke xl:table-cell">{t("directory.colCategories")}</TableHead>
              <TableHead className="text-xs font-medium text-smoke">{t("directory.colStatus")}</TableHead>
              <TableHead className="hidden text-xs font-medium text-smoke lg:table-cell">{t("directory.colAccess")}</TableHead>
              <TableHead className="pr-5 text-xs font-medium text-smoke">{t("directory.colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.id} className="relative border-stone align-top hover:bg-taupe/60">
                <TableCell className="max-w-[320px] py-3 pl-5 whitespace-normal">
                  <div className="flex items-start gap-3">
                    <PersonAvatar name={person.full_name} />
                    <div className="grid min-w-0 gap-1">
                      <div className="min-w-0">
                        <NameLink person={person} className="focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50" />
                        <Subtitle person={person} />
                      </div>
                      <MatchReasons reasons={person.reasons} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <ContactLinks person={person} />
                </TableCell>
                <TableCell className="hidden py-3 whitespace-normal xl:table-cell">
                  <CategoryList person={person} className="max-w-[240px]" />
                </TableCell>
                <TableCell className="py-3">
                  <StatusBadge status={person.status} />
                </TableCell>
                <TableCell className="hidden py-3 lg:table-cell">
                  <AccessBadge person={person} />
                </TableCell>
                <TableCell className="py-3 pr-5 whitespace-normal">
                  <ResourceActions person={actionPerson(person, true)} saved={saved.has(person.id)} compact className="max-w-[260px]" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Sheet>
      {cards}
    </>
  );
}

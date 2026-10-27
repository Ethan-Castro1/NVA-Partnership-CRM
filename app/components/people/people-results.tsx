/**
 * Directory results. Names link to the profile; each row has one main action
 * (Contact or Request introduction) and a Save icon.
 *
 * Staff: compact cards, two across on wide screens: name, title and actions on
 * one row, then one line of ways to help (or "Why:" when searching).
 * Admins: a CRM table on wide screens (person, categories, status, staff
 * access, a contact icon and a ⋯ menu; the whole row opens the profile) and
 * compact cards on phones, so nothing scrolls sideways at 375px.
 */
import { Link } from "react-router";
import { Eye, EyeOff, Handshake } from "lucide-react";
import { ContributionChips, PersonAvatar, Sheet, StatusBadge } from "~/components/nva";
import { MatchReasons } from "~/components/resources/match-reasons";
import { ResourceActions } from "~/components/resources/resource-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useT } from "~/i18n";
import type { SearchHit } from "~/lib/people.server";
import { cn } from "~/lib/utils";

function Subtitle({ person, className }: { person: SearchHit; className?: string }) {
  const { t } = useT();
  const text =
    person.title && person.organization_name
      ? t("directory.atOrg", { title: person.title, org: person.organization_name })
      : (person.title ?? person.organization_name);
  return text ? <span className={cn("block truncate text-xs text-smoke", className)}>{text}</span> : null;
}

/** The first category and "+N" for the rest. */
function CategorySummary({ person, className }: { person: SearchHit; className?: string }) {
  const { t } = useT();
  const [first, ...rest] = person.categories;
  if (!first) return <span className="text-xs text-smoke">{"–"}</span>;
  const all = person.categories.map((c) => t(`common.category.${c}`)).join(", ");
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 text-xs text-graphite", className)} title={all}>
      <span className="truncate">{t(`common.category.${first}`)}</span>
      {rest.length > 0 && <span className="shrink-0 text-smoke">+{rest.length}</span>}
    </span>
  );
}

/** Admins: whether staff can see this person, and how they reach them. */
function AccessLabel({ person }: { person: SearchHit }) {
  const { t } = useT();
  const [Icon, label] = !person.directory_visible
    ? [EyeOff, t("directory.hidden")]
    : person.contact_mode === "direct"
      ? [Eye, t("directory.modeDirect")]
      : [Handshake, t("directory.modeIntro")];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-graphite">
      <Icon className="size-3.5 text-smoke" aria-hidden="true" />
      {person.directory_visible && <span className="sr-only">{t("directory.shown")}: </span>}
      {label}
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

/**
 * One result as a compact card: used for staff everywhere and for admins on phones.
 * Name and title on the left, the actions on the right of the same row, then one line
 * (ways to help, or "Why:" when searching; admins see status and categories).
 */
function ResultCard({ person, saved, isAdmin }: { person: SearchHit; saved: boolean; isAdmin: boolean }) {
  const why = !isAdmin && person.reasons?.length;
  return (
    <Sheet className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 px-4 py-3 focus-within:ring-3 focus-within:ring-ring/50">
      <div className="flex items-center gap-3">
        <PersonAvatar name={person.full_name} className="size-9" />
        <div className="min-w-0 flex-1">
          <NameLink person={person} className="after:rounded-card" />
          {/* Two lines on phones, where the actions leave less room. */}
          <Subtitle person={person} className="max-sm:line-clamp-2 max-sm:whitespace-normal" />
        </div>
        <ResourceActions person={person} saved={saved} compact className="shrink-0 flex-nowrap" />
      </div>
      {isAdmin ? (
        <div className="flex min-w-0 items-center gap-2 pl-12">
          <StatusBadge status={person.status} />
          <CategorySummary person={person} className="min-w-0" />
        </div>
      ) : why ? (
        <MatchReasons reasons={person.reasons} max={2} className="truncate pl-12" />
      ) : (
        // One row of chips; any that would wrap are clipped.
        <ContributionChips types={person.contribution_types} className="h-6 overflow-hidden pl-12" />
      )}
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

  // Two across only when the results area itself is wide (not when the assistant panel squeezes it).
  const cards = (
    <div className={cn("@container min-w-0", isAdmin && "md:hidden")}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 @3xl:grid-cols-2">
        {people.map((person) => (
          <li key={person.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
            <ResultCard person={person} saved={saved.has(person.id)} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </div>
  );
  if (!isAdmin) return cards;

  return (
    <>
      <Sheet className="hidden p-0 md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-xs font-medium text-smoke">{t("directory.colPerson")}</TableHead>
              <TableHead className="w-[26%] text-xs font-medium text-smoke">{t("directory.colCategories")}</TableHead>
              <TableHead className="w-24 text-xs font-medium text-smoke">{t("directory.colStatus")}</TableHead>
              <TableHead className="w-32 text-xs font-medium text-smoke">{t("directory.colAccess")}</TableHead>
              <TableHead className="w-24 pr-5 text-right text-xs font-medium text-smoke">
                <span className="sr-only">{t("directory.colActions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.id} className="relative cursor-pointer border-stone hover:bg-taupe/60">
                <TableCell className="py-2.5 pl-5">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={person.full_name} className="size-8" />
                    <div className="min-w-0">
                      <NameLink person={person} className="text-sm focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50" />
                      <Subtitle person={person} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2.5">
                  <CategorySummary person={person} />
                </TableCell>
                <TableCell className="py-2.5">
                  <StatusBadge status={person.status} />
                </TableCell>
                <TableCell className="py-2.5">
                  <AccessLabel person={person} />
                </TableCell>
                <TableCell className="py-2.5 pr-4">
                  <ResourceActions person={person} saved={saved.has(person.id)} compact variant="icons" />
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

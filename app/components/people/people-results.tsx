/**
 * Directory results: a CRM-style table on wide screens and stacked cards on
 * phones (no sideways scrolling at 375px). Both show the same facts.
 */
import { Link } from "react-router";
import { Languages } from "lucide-react";
import { ContributionChips, PersonAvatar, Sheet, StatusBadge, TagList } from "~/components/nva";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useT } from "~/i18n";
import type { SearchHit } from "~/lib/people.server";
import { formatDate, isoDate } from "./format";

/** Matched skills first so the highlighted ones survive the "max 4" cut. */
function skillsForRow(person: SearchHit): string[] {
  const matched = person.skills.filter((s) => person.matched.includes(s));
  return [...matched, ...person.skills.filter((s) => !person.matched.includes(s))];
}

function Subtitle({ person }: { person: SearchHit }) {
  const { t } = useT();
  const text =
    person.title && person.organization_name
      ? t("people.profile.atOrg", { title: person.title, org: person.organization_name })
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
    <div className="grid gap-0.5">
      {person.email && (
        <a
          href={`mailto:${person.email}`}
          className="relative z-10 block max-w-[220px] truncate text-ink underline decoration-stone underline-offset-4 hover:decoration-gold"
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

export function PeopleResults({ people }: { people: SearchHit[] }) {
  const { t, locale } = useT();

  return (
    <>
      {/* Wide screens: table. */}
      <Sheet className="hidden p-0 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-xs font-medium text-smoke">{t("people.dir.colPerson")}</TableHead>
              <TableHead className="text-xs font-medium text-smoke">{t("people.dir.colContact")}</TableHead>
              <TableHead className="text-xs font-medium text-smoke">{t("people.dir.colWays")}</TableHead>
              <TableHead className="hidden text-xs font-medium text-smoke xl:table-cell">{t("people.dir.colSkills")}</TableHead>
              <TableHead className="text-xs font-medium text-smoke">{t("people.dir.colStatus")}</TableHead>
              <TableHead className="text-xs font-medium text-smoke">{t("people.dir.colLanguage")}</TableHead>
              <TableHead className="pr-5 text-right text-xs font-medium text-smoke">{t("people.dir.colUpdated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.id} className="relative border-stone hover:bg-taupe/60">
                <TableCell className="max-w-[260px] py-3 pl-5">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={person.full_name} />
                    <div className="min-w-0">
                      <Link
                        to={`/app/people/${person.id}`}
                        prefetch="intent"
                        className="block truncate font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {person.full_name}
                      </Link>
                      <Subtitle person={person} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  <ContactLinks person={person} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <ContributionChips types={person.contribution_types} className="max-w-[260px]" />
                </TableCell>
                <TableCell className="hidden whitespace-normal xl:table-cell">
                  <TagList tags={skillsForRow(person)} highlight={person.matched} max={2} className="max-w-[260px]" />
                </TableCell>
                <TableCell>
                  <StatusBadge status={person.status} />
                </TableCell>
                <TableCell>
                  <LanguagePill language={person.preferred_language} />
                </TableCell>
                <TableCell className="pr-5 text-right text-xs text-smoke">
                  <time dateTime={isoDate(person.updated_at)}>{formatDate(person.updated_at, locale)}</time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Sheet>

      {/* Phones: stacked cards; the whole card is the link. */}
      <ul className="grid gap-3 md:hidden">
        {people.map((person) => (
          <li key={person.id}>
            <Sheet className="relative grid gap-3 p-4 focus-within:ring-3 focus-within:ring-ring/50">
              <div className="flex items-start gap-3">
                <PersonAvatar name={person.full_name} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/app/people/${person.id}`}
                    prefetch="intent"
                    className="block truncate font-medium text-ink after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
                  >
                    {person.full_name}
                  </Link>
                  <Subtitle person={person} />
                  <ContactLinks person={person} />
                </div>
                <StatusBadge status={person.status} />
              </div>
              <ContributionChips types={person.contribution_types} />
              <TagList tags={skillsForRow(person)} highlight={person.matched} max={4} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-smoke">
                <LanguagePill language={person.preferred_language} />
                <time dateTime={isoDate(person.updated_at)} className="ml-auto">
                  {t("people.dir.updatedOn", { date: formatDate(person.updated_at, locale) })}
                </time>
              </div>
            </Sheet>
          </li>
        ))}
      </ul>
    </>
  );
}

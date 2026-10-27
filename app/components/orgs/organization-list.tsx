/**
 * Organizations (admins only): a table on wide screens, cards on phones.
 * Each row shows how many people are linked, how many staff can see, and
 * open opportunities.
 */
import { Link } from "react-router";
import { Building2 } from "lucide-react";
import { Sheet } from "~/components/nva";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useT } from "~/i18n";
import type { OrganizationListItem } from "~/lib/organizations.server";

function OrgIcon() {
  return (
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-taupe text-graphite">
      <Building2 className="size-4" />
    </span>
  );
}

export function usePeopleCount() {
  const { t } = useT();
  return (n: number) => (n === 1 ? t("directory.orgs.peopleOne") : t("directory.orgs.peopleCount", { count: n }));
}

export function OrganizationList({ items }: { items: OrganizationListItem[] }) {
  const { t } = useT();
  const people = usePeopleCount();
  const name = (org: OrganizationListItem, extra = "") => (
    <Link
      to={`/app/organizations/${org.id}`}
      prefetch="intent"
      className={`block truncate font-medium text-ink after:absolute after:inset-0 hover:underline focus-visible:outline-none ${extra}`}
    >
      {org.name}
    </Link>
  );

  return (
    <>
      <Sheet className="hidden p-0 md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-xs font-medium text-smoke">{t("directory.orgs.colName")}</TableHead>
              <TableHead className="w-40 text-xs font-medium text-smoke">{t("directory.orgs.colKind")}</TableHead>
              <TableHead className="w-56 text-xs font-medium text-smoke">{t("directory.orgs.colPeople")}</TableHead>
              <TableHead className="w-44 pr-5 text-right text-xs font-medium text-smoke">{t("directory.orgs.colOpen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((org) => (
              <TableRow key={org.id} className="relative cursor-pointer border-stone hover:bg-taupe/60">
                <TableCell className="py-2.5 pl-5">
                  <div className="flex items-center gap-3">
                    <OrgIcon />
                    <div className="min-w-0">
                      {name(org, "text-sm focus-visible:rounded focus-visible:ring-3 focus-visible:ring-ring/50")}
                      {org.website && <span className="block truncate text-xs text-smoke">{org.website}</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2.5 text-xs text-graphite">{t(`common.orgKind.${org.kind}`)}</TableCell>
                <TableCell className="py-2.5 text-xs">
                  <span className="text-graphite">{people(org.people_count)}</span>
                  {org.people_count > 0 && (
                    <span className="text-smoke"> · {t("directory.orgs.visibleCount", { count: org.visible_count })}</span>
                  )}
                </TableCell>
                <TableCell className="py-2.5 pr-5 text-right text-xs tabular-nums text-graphite">
                  {org.open_opportunities || <span className="text-smoke">{"\u2013"}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Sheet>

      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:hidden">
        {items.map((org) => (
          <li key={org.id}>
            <Sheet className="relative flex items-center gap-3 p-4 focus-within:ring-3 focus-within:ring-ring/50">
              <OrgIcon />
              <div className="min-w-0 flex-1">
                {name(org, "after:rounded-card")}
                <p className="truncate text-xs text-smoke">
                  {t(`common.orgKind.${org.kind}`)} · {people(org.people_count)}
                  {org.open_opportunities > 0 && <> · {t("directory.orgs.openCount", { count: org.open_opportunities })}</>}
                </p>
              </div>
            </Sheet>
          </li>
        ))}
      </ul>
    </>
  );
}

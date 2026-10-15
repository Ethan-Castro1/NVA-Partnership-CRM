import { Link } from "react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { ArrowUpDown, Mail, MoreHorizontal, Network, Pencil, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ContributionChips, PersonAvatar, StatusBadge, TagList } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useT, type TFunction } from "~/i18n";
import type { DashboardPerson, PeopleTableFeatures } from "./features";

const columnHelper = createColumnHelper<PeopleTableFeatures, DashboardPerson>();

/** A header that sorts its column when clicked. */
function SortHeader({ label, toggle, sorted }: { label: string; toggle: () => void; sorted: false | "asc" | "desc" }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 font-semibold text-graphite" onClick={toggle}>
      {label}
      <ArrowUpDown className={sorted ? "text-gold-ink" : "text-ash"} aria-hidden="true" />
    </Button>
  );
}

function RowActions({ person, isAdmin }: { person: DashboardPerson; isAdmin: boolean }) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("dashboard.table.openMenu", { name: person.full_name })}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 rounded-xl">
        <DropdownMenuLabel>{t("dashboard.table.actions")}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to={`/app/people/${person.id}`}>
            <UserRound aria-hidden="true" />
            {t("dashboard.table.viewProfile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={`/app/connections?q=${encodeURIComponent(person.full_name)}`}>
            <Network aria-hidden="true" />
            {t("dashboard.table.findPath")}
          </Link>
        </DropdownMenuItem>
        {person.email && (
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(person.email!).then(() => toast.success(t("dashboard.table.emailCopied")));
            }}
          >
            <Mail aria-hidden="true" />
            {t("dashboard.table.copyEmail")}
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/app/people/${person.id}/edit`}>
                <Pencil aria-hidden="true" />
                {t("dashboard.table.edit")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Column definitions, in the viewer's language. */
export function peopleColumns(t: TFunction, locale: "en" | "es", isAdmin: boolean) {
  const dateFormat = new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  return columnHelper.columns([
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t("dashboard.table.selectAll")}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t("dashboard.table.selectRow", { name: row.original.full_name })}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    }),
    // Hidden: what the search box matches (name, role, organization, email, skills).
    columnHelper.accessor(
      (p) => [p.full_name, p.title, p.organization_name, p.email, ...p.skills].filter(Boolean).join(" "),
      { id: "search", filterFn: "includesString", enableHiding: false, enableSorting: false },
    ),
    columnHelper.accessor("full_name", {
      id: "name",
      sortFn: "text",
      header: ({ column }) => (
        <SortHeader label={t("dashboard.table.colName")} sorted={column.getIsSorted()} toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ row }) => {
        const p = row.original;
        const subtitle = [p.title, p.organization_name].filter(Boolean).join(" · ");
        return (
          <Link to={`/app/people/${p.id}`} className="flex min-w-48 items-center gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <PersonAvatar name={p.full_name} />
            <span className="grid leading-tight">
              <span className="font-semibold text-ink hover:underline">{p.full_name}</span>
              {subtitle && <span className="text-xs text-smoke">{subtitle}</span>}
            </span>
          </Link>
        );
      },
    }),
    columnHelper.accessor("contribution_types", {
      id: "ways",
      header: () => t("dashboard.table.colWays"),
      enableSorting: false,
      filterFn: (row, columnId, value: string) => !value || (row.getValue(columnId) as string[]).includes(value),
      cell: ({ getValue }) => <ContributionChips types={getValue()} className="min-w-40" />,
    }),
    columnHelper.accessor("skills", {
      id: "skills",
      header: () => t("dashboard.table.colSkills"),
      enableSorting: false,
      cell: ({ getValue }) => <TagList tags={getValue()} max={3} className="min-w-40" />,
    }),
    columnHelper.accessor("affiliations", {
      id: "connection",
      header: () => t("dashboard.table.colConnection"),
      enableSorting: false,
      cell: ({ getValue }) => (
        <span className="text-sm text-graphite">
          {getValue()
            .map((a) => t(`common.affiliation.${a as "board"}`))
            .join(", ")}
        </span>
      ),
    }),
    columnHelper.accessor("email", {
      id: "email",
      header: () => t("dashboard.table.colEmail"),
      enableSorting: false,
      cell: ({ getValue }) => {
        const email = getValue();
        return email ? (
          <a href={`mailto:${email}`} className="text-sm text-blue-ink underline-offset-4 hover:underline">
            {email}
          </a>
        ) : (
          <span className="text-sm text-smoke">-</span>
        );
      },
    }),
    columnHelper.accessor("status", {
      id: "status",
      sortFn: "alphanumeric",
      filterFn: (row, columnId, value: string) => !value || row.getValue(columnId) === value,
      header: ({ column }) => (
        <SortHeader label={t("dashboard.table.colStatus")} sorted={column.getIsSorted()} toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ getValue }) => <StatusBadge status={getValue()} />,
    }),
    columnHelper.accessor("preferred_language", {
      id: "language",
      header: () => t("dashboard.table.colLanguage"),
      enableSorting: false,
      cell: ({ getValue }) => <span className="text-sm whitespace-nowrap text-graphite">{t(`common.language.${getValue()}`)}</span>,
    }),
    columnHelper.accessor("updated_at", {
      id: "updated",
      sortFn: "alphanumeric",
      header: ({ column }) => (
        <SortHeader label={t("dashboard.table.colUpdated")} sorted={column.getIsSorted()} toggle={() => column.toggleSorting(column.getIsSorted() === "asc")} />
      ),
      cell: ({ getValue }) => <span className="text-sm whitespace-nowrap text-smoke">{dateFormat.format(new Date(getValue()))}</span>,
    }),
    columnHelper.display({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => <RowActions person={row.original} isAdmin={isAdmin} />,
    }),
  ]);
}

/** Labels for the column-visibility menu. */
export const COLUMN_LABELS: Record<string, Parameters<TFunction>[0]> = {
  ways: "dashboard.table.colWays",
  skills: "dashboard.table.colSkills",
  connection: "dashboard.table.colConnection",
  email: "dashboard.table.colEmail",
  status: "dashboard.table.colStatus",
  language: "dashboard.table.colLanguage",
  updated: "dashboard.table.colUpdated",
};

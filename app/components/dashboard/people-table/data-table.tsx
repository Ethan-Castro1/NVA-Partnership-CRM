/**
 * The dashboard's people table (TanStack Table v9 + shadcn Table): search,
 * a ways-to-help and a status filter, sortable columns, column visibility,
 * row selection with "copy emails" for group outreach, and pagination.
 * Everything happens in the browser over the rows the loader sent.
 */
import * as React from "react";
import { useRouteLoaderData } from "react-router";
import {
  useTable,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Columns3, Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "~/components/nva";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { useT } from "~/i18n";
import { CONTRIBUTION_TYPES, PERSON_STATUSES } from "~/lib/constants";
import type { SessionUser } from "~/lib/types";
import { COLUMN_LABELS, peopleColumns } from "./columns";
import { features, type DashboardPerson } from "./features";

const ALL = "all";

export function PeopleDataTable({ data }: { data: DashboardPerson[] }) {
  const { t, locale } = useT();
  const root = useRouteLoaderData("root") as { user?: SessionUser | null } | undefined;
  const isAdmin = root?.user?.role === "admin";
  const columns = React.useMemo(() => peopleColumns(t, locale, isAdmin), [t, locale, isAdmin]);

  const [sorting, setSorting] = React.useState<SortingState>([{ id: "updated", desc: true }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({
    search: false,
    connection: false,
    email: false,
    language: false,
  });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const table = useTable({
    features,
    data,
    columns,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    state: { sorting, columnFilters, columnVisibility, rowSelection },
  });

  const filterValue = (id: string) => (table.getColumn(id)?.getFilterValue() as string | undefined) ?? "";
  const setFilter = (id: string, value: string) => table.getColumn(id)?.setFilterValue(value && value !== ALL ? value : undefined);

  const selected = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  const selectedEmails = selected.map((p) => p.email).filter((e): e is string => !!e);
  const total = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(table.getPageCount(), 1);
  const visibleColumns = table.getVisibleLeafColumns().length;

  return (
    <Panel
      title={t("dashboard.table.title")}
      action={<span className="text-sm text-smoke">{t("dashboard.table.count", { count: total })}</span>}
      bodyClassName="grid gap-3"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-smoke" aria-hidden="true" />
          <Input
            value={filterValue("search")}
            onChange={(event) => setFilter("search", event.target.value)}
            placeholder={t("dashboard.table.search")}
            aria-label={t("dashboard.table.search")}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterValue("ways") || ALL} onValueChange={(v) => setFilter("ways", v)}>
            <SelectTrigger className="h-10 min-w-44 bg-canvas" aria-label={t("dashboard.table.colWays")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("dashboard.table.allWays")}</SelectItem>
              {CONTRIBUTION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`common.contribution.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterValue("status") || ALL} onValueChange={(v) => setFilter("status", v)}>
            <SelectTrigger className="h-10 min-w-36 bg-canvas" aria-label={t("dashboard.table.colStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("dashboard.table.allStatuses")}</SelectItem>
              {PERSON_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`common.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          {selected.length > 0 && (
            <Button
              variant="brand"
              size="sm"
              disabled={!selectedEmails.length}
              onClick={() => {
                void navigator.clipboard
                  .writeText(selectedEmails.join(", "))
                  .then(() => toast.success(t("dashboard.table.emailsCopied", { count: selectedEmails.length })));
              }}
            >
              <Copy aria-hidden="true" />
              {t("dashboard.table.copyEmails", { count: selectedEmails.length })}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 aria-hidden="true" />
                {t("dashboard.table.columns")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuLabel>{t("dashboard.table.showColumns")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide() && COLUMN_LABELS[column.id])
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {t(COLUMN_LABELS[column.id])}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone bg-canvas">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-11 text-xs font-semibold text-graphite">
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined} className="data-[state=selected]:bg-gold-soft/60">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 align-middle">
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={visibleColumns} className="h-24 text-center text-smoke">
                  {t("dashboard.table.noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-smoke sm:flex-row sm:items-center sm:justify-between">
        <span aria-live="polite">{t("dashboard.table.selected", { selected: selected.length, total })}</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span>{t("dashboard.table.rowsPerPage")}</span>
            <Select value={String(table.state.pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-20 bg-canvas" aria-label={t("dashboard.table.rowsPerPage")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <span>{t("dashboard.table.pageOf", { page: table.state.pagination.pageIndex + 1, pages: pageCount })}</span>
          <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label={t("dashboard.table.previous")}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label={t("dashboard.table.next")}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Panel>
  );
}

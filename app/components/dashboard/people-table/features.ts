/**
 * The TanStack Table v9 features the dashboard's people table uses. Anything
 * not listed here is left out of the bundle.
 */
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

export const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

export type PeopleTableFeatures = typeof features;

/** One row: a person as the dashboard loader sends it. */
export type DashboardPerson = {
  id: string;
  full_name: string;
  title: string | null;
  organization_name: string | null;
  email: string | null;
  contribution_types: string[];
  skills: string[];
  affiliations: string[];
  status: "lead" | "new" | "active" | "inactive";
  preferred_language: "en" | "es" | "both";
  updated_at: string;
};

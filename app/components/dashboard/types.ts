/** What the dashboard loader sends to its panels. Dates are ISO strings. */
import type { CapStatus, ContributionType, EngagementKind, PersonStatus } from "~/lib/constants";

export type RecentPerson = {
  id: string;
  full_name: string;
  title: string | null;
  organization_name: string | null;
  contribution_types: ContributionType[];
  status: PersonStatus;
  created_at: string;
};

export type RecentEngagement = {
  id: string;
  kind: EngagementKind;
  /** A calendar date, YYYY-MM-DD. */
  happened_on: string;
  person_id: string;
  person_name: string;
  user_name: string | null;
  cap_id: string | null;
  cap_title: string | null;
};

export type DashboardCap = {
  id: string;
  title: string;
  status: CapStatus;
  term: string | null;
  topics: string[];
  partner_count: number;
  confirmed_count: number;
};

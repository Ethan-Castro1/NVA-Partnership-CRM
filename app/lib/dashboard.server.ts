/**
 * Data for the two dashboards at /app. The admin one is a list of things to act
 * on; the staff one is Search, Connect, Arrange. Everything goes through
 * viewer-scoped functions, and the admin-only pieces refuse staff.
 */
import { listMyCaps, type CapSummary } from "./caps.server";
import type { ContributionType, HistoryKind, OpportunityStage, OpportunityTrack } from "./constants";
import { ADMIN_LOGGABLE_KINDS, OPEN_STAGES, STAGES_BY_TRACK } from "./constants";
import { schoolToday } from "./dates";
import { query } from "./db.server";
import { countFollowUps, listFollowUps, type FollowUpItem } from "./follow-ups.server";
import { assertAdmin, countOpportunitiesByStage, getCrmFormOptions, type NamedOption, type PersonOption } from "./opportunities.server";
import { getPeopleByIds, type PersonSummary } from "./people.server";
import { isAdmin, staffVisibleSql, type Viewer } from "./permissions.server";
import {
  countIntroductionsNeedingAttention,
  getRequestAttention,
  listMyActiveRequests,
  listUpcomingArranged,
  type RequestAttention,
  type RequestView,
} from "./requests.server";
import { listSaved, savedIdsAmong, type SavedResource } from "./saved.server";
import type { SessionUser } from "./types";

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

// ---------- navigation counts ----------

export type NavCounts = { overdueFollowUps: number; newSignups: number; introductions: number };

/** The small numbers in the sidebar. All zero for staff. */
export async function getNavCounts(viewer: Viewer): Promise<NavCounts> {
  if (!isAdmin(viewer)) return { overdueFollowUps: 0, newSignups: 0, introductions: 0 };
  const [followUps, signups, introductions] = await Promise.all([
    countFollowUps(viewer),
    countNewSignups(viewer),
    countIntroductionsNeedingAttention(viewer),
  ]);
  return { overdueFollowUps: followUps.overdue, newSignups: signups, introductions };
}

// ---------- admin pieces ----------

export async function countNewSignups(viewer: Viewer): Promise<number> {
  if (!isAdmin(viewer)) return 0;
  const rows = await query<{ n: number }>("SELECT count(*)::int AS n FROM intake_submissions WHERE status = 'new'");
  return rows[0]?.n ?? 0;
}

export type DashboardSignup = {
  id: string;
  full_name: string;
  contribution_types: ContributionType[];
  submitted_at: string;
};

/** Sign-ups waiting for review, newest first (admin only). */
export async function listNewSignups(viewer: Viewer, limit = 5): Promise<DashboardSignup[]> {
  assertAdmin(viewer);
  const rows = await query<Omit<DashboardSignup, "submitted_at"> & { submitted_at: unknown }>(
    `SELECT s.id,
            coalesce(nullif(coalesce(s.edited_payload, s.payload)->>'full_name', ''), '') AS full_name,
            CASE WHEN jsonb_typeof(coalesce(s.edited_payload, s.payload)->'contribution_types') = 'array'
                 THEN ARRAY(SELECT jsonb_array_elements_text(coalesce(s.edited_payload, s.payload)->'contribution_types'))
                 ELSE '{}'::text[] END AS contribution_types,
            s.submitted_at
       FROM intake_submissions s
      WHERE s.status = 'new'
      ORDER BY s.submitted_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((r) => ({ ...r, submitted_at: iso(r.submitted_at) }));
}

export type ActivityOrigin = "manual" | "system" | "email" | "staff_request";

export type DashboardActivity = {
  id: string;
  kind: HistoryKind;
  origin: ActivityOrigin;
  /** YYYY-MM-DD */
  happened_on: string;
  person_id: string;
  person_name: string;
  user_name: string | null;
  /** A short preview of the note (admin only). */
  summary: string | null;
};

/** History kinds that are real contact with someone (not bookkeeping like "follow-up scheduled"). */
export const CONTACT_ACTIVITY_KINDS: readonly HistoryKind[] = [...ADMIN_LOGGABLE_KINDS, "follow_up_completed", "engagement_completed"];

/**
 * Recent contact history across everyone (admin only): calls, meetings, notes,
 * emails and completed work. Email rows keep origin "email" so they read apart from notes.
 */
export async function listRecentActivity(viewer: Viewer, limit = 8): Promise<DashboardActivity[]> {
  assertAdmin(viewer);
  return query<DashboardActivity>(
    `SELECT e.id, e.kind, e.origin, e.happened_on::text AS happened_on, p.id AS person_id, p.full_name AS person_name,
            u.name AS user_name, left(e.notes, 140) AS summary
       FROM engagements e
       JOIN people p ON p.id = e.person_id
       LEFT JOIN users u ON u.id = e.user_id
      WHERE e.kind = ANY($2::text[])
      ORDER BY e.happened_on DESC, e.created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 50), [...CONTACT_ACTIVITY_KINDS]],
  );
}

export type StageCount = { track: OpportunityTrack; stage: OpportunityStage; count: number };

/** Open opportunities per stage, engagement first then funding (admin only). Stages with none are left out. */
export async function openOpportunitiesByStage(viewer: Viewer): Promise<StageCount[]> {
  assertAdmin(viewer);
  const tracks: OpportunityTrack[] = ["engagement", "funding"];
  const counts = await Promise.all(tracks.map((track) => countOpportunitiesByStage(viewer, { track })));
  const open = new Set<string>(OPEN_STAGES);
  return tracks.flatMap((track, i) =>
    (STAGES_BY_TRACK[track] as readonly OpportunityStage[])
      .filter((stage) => open.has(stage) && (counts[i]?.[stage] ?? 0) > 0)
      .map((stage) => ({ track, stage, count: counts[i]?.[stage] ?? 0 })),
  );
}

export type AdminDashboard = {
  today: string;
  followUpCounts: Awaited<ReturnType<typeof countFollowUps>>;
  dueNow: FollowUpItem[];
  upcoming: FollowUpItem[];
  awaiting: FollowUpItem[];
  activity: DashboardActivity[];
  stages: StageCount[];
  attention: RequestAttention;
  signups: DashboardSignup[];
  signupCount: number;
  engagements: RequestView[];
  people: PersonOption[];
  owners: NamedOption[];
};

export async function getAdminDashboard(viewer: Viewer): Promise<AdminDashboard> {
  assertAdmin(viewer);
  const today = schoolToday();
  const [followUpCounts, dueNow, upcoming, awaiting, activity, stages, attention, signups, signupCount, engagements, options] =
    await Promise.all([
      countFollowUps(viewer, { today }),
      listFollowUps(viewer, { views: ["overdue", "today"], today, limit: 8 }),
      listFollowUps(viewer, { views: "upcoming", today, limit: 5 }),
      listFollowUps(viewer, { views: "awaiting", today, limit: 5 }),
      listRecentActivity(viewer, 5),
      openOpportunitiesByStage(viewer),
      getRequestAttention(viewer, { limit: 5 }),
      listNewSignups(viewer, 5),
      countNewSignups(viewer),
      listUpcomingArranged(viewer, 5),
      getCrmFormOptions(viewer),
    ]);
  return {
    today,
    followUpCounts,
    dueNow,
    upcoming,
    awaiting,
    activity,
    stages,
    attention,
    signups,
    signupCount,
    engagements,
    people: options.people,
    owners: options.owners,
  };
}

// ---------- staff pieces ----------

export type DashboardResource = PersonSummary & { saved: boolean };

/**
 * People most recently added to the staff directory (approved, else created),
 * as the viewer may see them. Always limited to the staff directory, even for
 * admins, so this list matches what staff see.
 */
export async function listRecentResources(viewer: Viewer, limit = 6): Promise<DashboardResource[]> {
  const ids = await query<{ id: string }>(
    `SELECT p.id FROM people p
      WHERE ${staffVisibleSql("p")}
      ORDER BY coalesce(p.approved_at, p.created_at) DESC, p.full_name
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 24)],
  );
  const order = ids.map((r) => r.id);
  const [people, saved] = await Promise.all([getPeopleByIds(order, viewer), savedIdsAmong(viewer, order)]);
  const byId = new Map(people.map((p) => [p.id, p]));
  return order.flatMap((id) => {
    const person = byId.get(id);
    return person ? [{ ...person, saved: saved.has(id) }] : [];
  });
}

export type StaffDashboard = {
  myRequests: RequestView[];
  engagements: RequestView[];
  caps: CapSummary[];
  recent: DashboardResource[];
  saved: SavedResource[];
};

export async function getStaffDashboard(user: Pick<SessionUser, "id" | "name" | "role">): Promise<StaffDashboard> {
  const [myRequests, engagements, caps, recent, saved] = await Promise.all([
    listMyActiveRequests(user, 5),
    listUpcomingArranged(user, 5),
    listMyCaps(user, { limit: 4 }),
    listRecentResources(user, 6),
    listSaved(user, { limit: 6 }),
  ]);
  return { myRequests, engagements, caps, recent, saved };
}

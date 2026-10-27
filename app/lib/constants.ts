import { CAP_TOPIC_KEYS } from "./cap-catalog";

/**
 * Shared vocabularies. Keys are stored in the database; labels live in the
 * i18n dictionaries (app/i18n/common.ts) under `contribution.<key>` etc.
 */

/** The ways someone can help, each with its brand colour (see app.css). */
export const CONTRIBUTION_TYPES = [
  "skills_lesson",
  "classroom_volunteer",
  "guest_speaker",
  "mentoring",
  "after_school",
  "internship",
  "cap_partner",
  "funder",
  "other",
] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/**
 * What the public sign-up form offers. Community members teach, volunteer,
 * speak, mentor or host interns; NVA staff identify CAP partners and funders
 * and add them with the staff form (/app/people/new).
 */
export const PUBLIC_CONTRIBUTION_TYPES = [
  "skills_lesson",
  "classroom_volunteer",
  "guest_speaker",
  "mentoring",
  "after_school",
  "internship",
  "other",
] as const satisfies readonly ContributionType[];

export const CONTRIBUTION_COLOR: Record<
  ContributionType,
  { dot: string; soft: string; ink: string; hex: string }
> = {
  skills_lesson: { dot: "bg-rust", soft: "bg-rust-soft", ink: "text-rust-ink", hex: "#cf6608" },
  classroom_volunteer: { dot: "bg-blue", soft: "bg-blue-soft", ink: "text-blue-ink", hex: "#277f93" },
  guest_speaker: { dot: "bg-blue-ink", soft: "bg-blue-soft", ink: "text-blue-ink", hex: "#1f6a7b" },
  mentoring: { dot: "bg-sage-ink", soft: "bg-sage-soft", ink: "text-sage-ink", hex: "#55703a" },
  internship: { dot: "bg-purple", soft: "bg-purple-soft", ink: "text-purple-ink", hex: "#7e6f8f" },
  cap_partner: { dot: "bg-sage", soft: "bg-sage-soft", ink: "text-sage-ink", hex: "#9cb47d" },
  after_school: { dot: "bg-gold", soft: "bg-gold-soft", ink: "text-gold-ink", hex: "#faad00" },
  funder: { dot: "bg-ink", soft: "bg-stone", ink: "text-ink", hex: "#000000" },
  other: { dot: "bg-ash", soft: "bg-taupe", ink: "text-graphite", hex: "#a59f97" },
};

/** How someone is connected to NVA. 'board' and 'staff' are the inner circle for the connection finder. */
export const AFFILIATIONS = ["board", "staff", "parent", "alumni", "community"] as const;
export type Affiliation = (typeof AFFILIATIONS)[number];
export const INNER_CIRCLE: readonly Affiliation[] = ["board", "staff"];

export const PERSON_STATUSES = ["lead", "new", "active", "inactive"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const PERSON_SOURCES = ["intake", "referral", "admin", "web", "import"] as const;
export type PersonSource = (typeof PERSON_SOURCES)[number];

export const RELATIONSHIP_KINDS = ["referred", "knows", "colleague", "family", "other"] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const ORGANIZATION_KINDS = [
  "business",
  "foundation",
  "nonprofit",
  "government",
  "education",
  "health",
  "faith",
  "other",
] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

/**
 * Kinds of entry in a person's history (the engagements table). Checked in
 * app code, not by the database, so new kinds need no migration.
 */
export const HISTORY_KINDS = [
  "lesson",
  "volunteer",
  "internship",
  "guest_speaker",
  "meeting",
  "call",
  "note",
  "email_sent",
  "email_received",
  "contact_created",
  "signup_submitted",
  "signup_approved",
  "follow_up_scheduled",
  "follow_up_completed",
  "opportunity_updated",
  "engagement_completed",
  "request_update",
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
/** History kinds were called engagement kinds before; same values. */
export type EngagementKind = HistoryKind;

/** What an admin can log by hand on a profile. */
export const ADMIN_LOGGABLE_KINDS = [
  "lesson",
  "volunteer",
  "internship",
  "guest_speaker",
  "meeting",
  "call",
  "note",
  "email_sent",
  "email_received",
] as const satisfies readonly HistoryKind[];
/** What staff can log (only on people they can see): the work itself, never CRM notes. */
export const STAFF_LOGGABLE_KINDS = ["lesson", "volunteer", "internship", "guest_speaker"] as const satisfies readonly HistoryKind[];
/** @deprecated Use ADMIN_LOGGABLE_KINDS or STAFF_LOGGABLE_KINDS. The manual log form's kinds. */
export const ENGAGEMENT_KINDS = ADMIN_LOGGABLE_KINDS;
/** Kinds staff see in a person's history by default (visibility 'staff'). */
export const STAFF_VISIBLE_KINDS = [
  "lesson",
  "volunteer",
  "internship",
  "guest_speaker",
  "engagement_completed",
] as const satisfies readonly HistoryKind[];
/** Logging one of these moves a lead or new contact to active (only when asked: see recordHistory). */
export const WORK_KINDS = ["lesson", "volunteer", "internship", "guest_speaker"] as const satisfies readonly HistoryKind[];

export const HISTORY_ORIGINS = ["manual", "system", "email", "staff_request"] as const;
export type HistoryOrigin = (typeof HISTORY_ORIGINS)[number];
export const HISTORY_VISIBILITIES = ["admin", "staff"] as const;
export type HistoryVisibility = (typeof HISTORY_VISIBILITIES)[number];

// ---------- CRM contacts ----------

/** CRM categories: a contact can have several. */
export const CONTACT_CATEGORIES = [
  "volunteer",
  "guest_speaker",
  "skills_instructor",
  "internship_host",
  "cap_partner",
  "community_org",
  "funder",
  "prospective_funder",
  "business",
  "government",
  "other",
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

/** 'direct': staff see email and phone. 'introduction': staff ask the admin for an introduction. */
export const CONTACT_MODES = ["direct", "introduction"] as const;
export type ContactMode = (typeof CONTACT_MODES)[number];

const CATEGORY_FOR_CONTRIBUTION: Partial<Record<ContributionType, ContactCategory>> = {
  skills_lesson: "skills_instructor",
  classroom_volunteer: "volunteer",
  after_school: "volunteer",
  mentoring: "volunteer",
  guest_speaker: "guest_speaker",
  internship: "internship_host",
  cap_partner: "cap_partner",
  funder: "funder",
};
const CATEGORY_FOR_ORG_KIND: Partial<Record<string, ContactCategory>> = {
  business: "business",
  government: "government",
  nonprofit: "community_org",
  faith: "community_org",
  education: "community_org",
  health: "community_org",
};

/** Categories implied by ways to help and organization kind (the categories_v1 mapping), in vocabulary order. */
export function categoriesFor(
  contributionTypes: readonly string[],
  organizationKind?: string | null,
  existing: readonly string[] = [],
): ContactCategory[] {
  const out = new Set<string>(existing);
  for (const type of contributionTypes) {
    const category = CATEGORY_FOR_CONTRIBUTION[type as ContributionType];
    if (category) out.add(category);
  }
  const orgCategory = organizationKind ? CATEGORY_FOR_ORG_KIND[organizationKind] : undefined;
  if (orgCategory) out.add(orgCategory);
  return CONTACT_CATEGORIES.filter((c) => out.has(c));
}

// ---------- opportunities, follow-ups and staff requests ----------

export const OPPORTUNITY_TRACKS = ["engagement", "funding"] as const;
export type OpportunityTrack = (typeof OPPORTUNITY_TRACKS)[number];

export const ENGAGEMENT_STAGES = ["not_contacted", "contacted", "committed", "completed", "closed_declined", "canceled"] as const;
export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number];
export const FUNDING_STAGES = ["identified", "cultivating", "proposal_submitted", "awarded", "declined", "canceled"] as const;
export type FundingStage = (typeof FUNDING_STAGES)[number];
export type OpportunityStage = EngagementStage | FundingStage;
export const STAGES_BY_TRACK = { engagement: ENGAGEMENT_STAGES, funding: FUNDING_STAGES } as const;
/** Stages that count as "open opportunities". */
export const OPEN_STAGES = [
  "not_contacted",
  "contacted",
  "committed",
  "identified",
  "cultivating",
  "proposal_submitted",
] as const satisfies readonly OpportunityStage[];

export const ENGAGEMENT_OPPORTUNITY_KINDS = [
  "guest_speaker",
  "skills_lesson",
  "volunteering",
  "internship",
  "cap_partner",
  "event",
  "mentoring",
  "other",
] as const;
export const FUNDING_OPPORTUNITY_KINDS = ["grant", "donation", "sponsorship", "in_kind"] as const;
export const OPPORTUNITY_KINDS = [...ENGAGEMENT_OPPORTUNITY_KINDS, ...FUNDING_OPPORTUNITY_KINDS] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];
export const KINDS_BY_TRACK = { engagement: ENGAGEMENT_OPPORTUNITY_KINDS, funding: FUNDING_OPPORTUNITY_KINDS } as const;

export const FOLLOW_UP_STATUSES = ["open", "completed", "canceled"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export const FOLLOW_UP_VIEWS = ["overdue", "today", "upcoming", "awaiting", "completed"] as const;
export type FollowUpView = (typeof FOLLOW_UP_VIEWS)[number];

export const REQUEST_STATUSES = ["open", "arranged", "completed", "canceled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_KINDS = ["resource", "introduction"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_PERSON_ROLES = ["interest", "assigned"] as const;
export type RequestPersonRole = (typeof REQUEST_PERSON_ROLES)[number];

export const EMAIL_PROVIDERS = ["google", "microsoft"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const CAP_STATUSES = ["planning", "active", "complete"] as const;
export type CapStatus = (typeof CAP_STATUSES)[number];

export const CAP_PARTNER_STATUSES = ["suggested", "contacted", "confirmed", "declined"] as const;
export type CapPartnerStatus = (typeof CAP_PARTNER_STATUSES)[number];

/** Sign-up review: 'reviewed' (before the review queue) became 'approved'. */
export const INTAKE_STATUSES = ["new", "approved", "rejected", "archived"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

/** Two roles: admins run the CRM; staff (teachers, counselors, everyone else) find and request help. */
export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const LANGUAGES = ["en", "es", "both"] as const;
export type PreferredLanguage = (typeof LANGUAGES)[number];

/** CAP topics for pickers: this semester's CAPs (app/lib/cap-catalog.ts). People can type their own too. */
export const SUGGESTED_CAP_TOPICS: readonly string[] = CAP_TOPIC_KEYS;

/** Lowercase, trim, dedupe and drop empties: how tags are stored. */
export function normalizeTags(input: Iterable<string> | string | null | undefined): string[] {
  const raw = typeof input === "string" ? input.split(/[,;\n]/) : input ? Array.from(input) : [];
  const out = new Set<string>();
  for (const tag of raw) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, " ");
    if (clean && clean.length <= 60) out.add(clean);
  }
  return [...out];
}

/** People per page in the directory. */
export const PAGE_SIZE = 50;

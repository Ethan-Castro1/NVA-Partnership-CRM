import { CAP_TOPIC_KEYS } from "./cap-catalog";

/**
 * Shared vocabularies. Keys are stored in the database; labels live in the
 * i18n dictionaries (app/i18n/common.ts) under `contribution.<key>` etc.
 */

/** The ways someone can help, each with its brand colour (see app.css). */
export const CONTRIBUTION_TYPES = [
  "skills_lesson",
  "classroom_volunteer",
  "after_school",
  "internship",
  "cap_partner",
  "funder",
  "other",
] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/**
 * What the public sign-up form offers. Community members mostly teach or
 * volunteer; NVA staff identify CAP partners, internship hosts and funders
 * and add them with the staff form (/app/people/new).
 */
export const PUBLIC_CONTRIBUTION_TYPES = [
  "skills_lesson",
  "classroom_volunteer",
  "after_school",
  "other",
] as const satisfies readonly ContributionType[];

export const CONTRIBUTION_COLOR: Record<
  ContributionType,
  { dot: string; soft: string; ink: string; hex: string }
> = {
  skills_lesson: { dot: "bg-rust", soft: "bg-rust-soft", ink: "text-rust-ink", hex: "#cf6608" },
  classroom_volunteer: { dot: "bg-blue", soft: "bg-blue-soft", ink: "text-blue-ink", hex: "#277f93" },
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

export const ENGAGEMENT_KINDS = ["lesson", "volunteer", "internship", "meeting", "email", "call", "note"] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];

export const CAP_STATUSES = ["planning", "active", "complete"] as const;
export type CapStatus = (typeof CAP_STATUSES)[number];

export const CAP_PARTNER_STATUSES = ["suggested", "contacted", "confirmed", "declined"] as const;
export type CapPartnerStatus = (typeof CAP_PARTNER_STATUSES)[number];

export const INTAKE_STATUSES = ["new", "reviewed", "archived"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const ROLES = ["admin", "teacher"] as const;
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

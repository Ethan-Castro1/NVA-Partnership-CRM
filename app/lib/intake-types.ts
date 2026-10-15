import type { Affiliation, ContributionType, PreferredLanguage, RelationshipKind } from "./constants";

/**
 * What the public "Get involved" form submits, stored as-is in
 * intake_submissions.payload so admins always see exactly what was sent.
 */
export type IntakeReferral = {
  name: string;
  email?: string | null;
  phone?: string | null;
  /** How the submitter knows them: "my coworker", "my cousin". */
  how_known?: string | null;
  /** What they could help with: "she runs a sewing shop". */
  can_help_with?: string | null;
  kind?: RelationshipKind;
};

export type IntakePayload = {
  full_name: string;
  email: string;
  phone?: string | null;
  preferred_language: PreferredLanguage;
  organization?: string | null;
  title?: string | null;
  contribution_types: ContributionType[];
  skills: string[];
  cap_topics: string[];
  availability?: string | null;
  bio?: string | null;
  affiliations: Affiliation[];
  /** Who pointed them to NVA, if anyone. */
  referred_by?: { name: string; email?: string | null } | null;
  /** Other people they think could help. Each becomes a 'lead'. */
  referrals: IntakeReferral[];
  consent: boolean;
};

/**
 * The public sign-up form's raw values and errors, shared by the /join route
 * (server) and its components (browser). Raw values are kept as typed so the
 * form can be re-filled after a validation error.
 */
import type { MessageKey } from "~/i18n";

/** Referral slots on the form. Inputs are named by slot (ref_name_0, ...). */
export const REFERRAL_SLOTS = 3;

export type ReferralRowValues = {
  name: string;
  contact: string;
  how_known: string;
  can_help_with: string;
};

export type IntakeFormValues = {
  full_name: string;
  email: string;
  phone: string;
  preferred_language: string;
  organization: string;
  title: string;
  contribution_types: string[];
  skills: string;
  /** What they have in mind when they pick "Something else". */
  other_help: string;
  cap_topics: string[];
  cap_topics_other: string;
  availability: string;
  bio: string;
  affiliations: string[];
  referred_by_name: string;
  referred_by_email: string;
  /** Always REFERRAL_SLOTS long; blank rows are skipped on submit. */
  referrals: ReferralRowValues[];
  consent: boolean;
};

/**
 * Field path ("email", "referrals.1.contact", "_form") to an i18n key.
 * The component translates; the server never sends display text.
 */
export type IntakeErrors = Record<string, MessageKey>;

export function isBlankReferral(row: ReferralRowValues): boolean {
  return !row.name.trim() && !row.contact.trim() && !row.how_known.trim() && !row.can_help_with.trim();
}

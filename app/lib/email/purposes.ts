/** The kinds of AI email draft (safe to import from components). */
export const DRAFT_PURPOSES = [
  "introduction",
  "thank_you",
  "follow_up",
  "meeting_request",
  "partnership_invitation",
  "funding_follow_up",
] as const;
export type DraftPurpose = (typeof DRAFT_PURPOSES)[number];
/** "custom" = written by hand, no AI. */
export type DraftPurposeOrCustom = DraftPurpose | "custom";
export const isDraftPurpose = (v: unknown): v is DraftPurpose => typeof v === "string" && (DRAFT_PURPOSES as readonly string[]).includes(v);

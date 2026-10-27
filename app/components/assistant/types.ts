/**
 * Shapes shared by the assistant's server code and its page. Plain types only,
 * so this file is safe to import from both sides.
 */
import type { ContactMode, ContributionType, PersonStatus } from "~/lib/constants";
import type { MatchReason } from "~/lib/search-language";

/** One turn as the browser keeps it and sends it back (text only). */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/** What a person card under an answer needs. */
export type AssistantPerson = {
  id: string;
  full_name: string;
  title: string | null;
  organization_name: string | null;
  contribution_types: ContributionType[];
  status: PersonStatus;
  skills: string[];
  /** As the viewer may see them: staff get these only for direct contacts. */
  email?: string | null;
  phone?: string | null;
  /** direct: Contact; introduction: Request Introduction. */
  contact_mode?: ContactMode;
  /** Whether the viewer has saved this person. */
  saved?: boolean;
  /** Why they matched the search (from fields the viewer may see). */
  reasons?: MatchReason[];
};

/** Limits the page and the server agree on. */
export const MAX_TURNS = 20;
export const MAX_MESSAGE_CHARS = 2000;

/** Example prompts (i18n keys under assistant.example.*), shown on the dashboard and the empty chat. */
export const EXAMPLE_PROMPTS = ["sewing", "bay", "health", "internship"] as const;

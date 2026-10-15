/**
 * Server-side parsing for the people pages: the add/edit person form, the
 * small forms on a profile (log activity, add a connection, add to a CAP) and
 * the directory's URL filters. Everything a person can type is validated here
 * with zod; errors come back as i18n keys so the page can show them in either
 * language. Unknown vocabulary values are dropped, never stored.
 */
import { z } from "zod";
import type { MessageKey } from "~/i18n";
import {
  AFFILIATIONS,
  CONTRIBUTION_TYPES,
  ENGAGEMENT_KINDS,
  LANGUAGES,
  ORGANIZATION_KINDS,
  PERSON_STATUSES,
  RELATIONSHIP_KINDS,
  normalizeTags,
  type Affiliation,
  type ContributionType,
  type EngagementKind,
  type PersonStatus,
  type RelationshipKind,
} from "./constants";
import type { PeopleFilter, PersonInput } from "./people.server";

/** Tags beyond this many are dropped: enough for anyone, small enough for search. */
const MAX_TAGS = 40;

const str = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

/** Picks the known values, in vocabulary order, from a repeated form field. */
function known<T extends string>(vocab: readonly T[], values: unknown[]): T[] {
  const given = new Set(values.filter((v): v is string => typeof v === "string"));
  return vocab.filter((v) => given.has(v));
}

function oneOf<T extends string>(vocab: readonly T[], value: unknown): T | undefined {
  return typeof value === "string" && (vocab as readonly string[]).includes(value) ? (value as T) : undefined;
}

// ---------- add / edit a person ----------

export const PERSON_FORM_FIELDS = [
  "full_name",
  "email",
  "phone",
  "organization_name",
  "title",
  "skills",
  "cap_topics",
  "availability",
  "bio",
  "notes",
] as const;
export type PersonFormField = (typeof PERSON_FORM_FIELDS)[number];

export type PersonFormErrorKey = Extract<
  MessageKey,
  "people.form.errorNameRequired" | "people.form.errorEmail" | "people.form.errorTooLong"
>;
export type PersonFormErrors = Partial<Record<PersonFormField, PersonFormErrorKey>>;

const TOO_LONG: PersonFormErrorKey = "people.form.errorTooLong";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: TOO_LONG })
    .transform((v) => v || null);
const tags = z
  .string()
  .max(2000, { error: TOO_LONG })
  .transform((v) => normalizeTags(v).slice(0, MAX_TAGS));

const personSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, { error: "people.form.errorNameRequired" satisfies PersonFormErrorKey })
    .max(200, { error: TOO_LONG }),
  email: z
    .string()
    .trim()
    .max(254, { error: TOO_LONG })
    .refine((v) => v === "" || z.email().safeParse(v).success, { error: "people.form.errorEmail" satisfies PersonFormErrorKey })
    .transform((v) => v.toLowerCase() || null),
  phone: optionalText(40),
  organization_name: optionalText(200),
  title: optionalText(200),
  skills: tags,
  cap_topics: tags,
  availability: optionalText(500),
  bio: optionalText(4000),
  notes: optionalText(4000),
});

export type PersonFormResult =
  | { ok: true; input: PersonInput & { email: string | null } }
  | { ok: false; errors: PersonFormErrors };

/**
 * Reads the shared PersonForm. Free-text fields are validated (first error per
 * field wins); vocabulary fields fall back to safe defaults when missing or
 * unknown. `source` is never read from the form: the route decides it.
 */
export function parsePersonForm(form: FormData): PersonFormResult {
  const raw = Object.fromEntries(PERSON_FORM_FIELDS.map((field) => [field, str(form, field)]));
  const parsed = personSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: PersonFormErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as PersonFormField;
      errors[field] ??= issue.message as PersonFormErrorKey;
    }
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      ...parsed.data,
      preferred_language: oneOf(LANGUAGES, form.get("preferred_language")) ?? "en",
      organization_kind: oneOf(ORGANIZATION_KINDS, form.get("organization_kind")) ?? "other",
      contribution_types: known(CONTRIBUTION_TYPES, form.getAll("contribution_types")),
      affiliations: known(AFFILIATIONS, form.getAll("affiliations")),
      status: oneOf(PERSON_STATUSES, form.get("status")) ?? "new",
    },
  };
}

// ---------- profile actions ----------

type ProfileErrorKey = Extract<
  MessageKey,
  | "people.error.kind"
  | "people.error.date"
  | "people.error.person"
  | "people.error.relKind"
  | "people.error.cap"
  | "people.error.tooLong"
>;
export type ProfileFormErrors = Partial<Record<string, ProfileErrorKey>>;
type ProfileResult<T> = { ok: true; value: T } | { ok: false; errors: ProfileFormErrors };

const id = z.string().trim().min(1).max(100);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) && d.getUTCFullYear() >= 1990;
  });

function limited(form: FormData, key: string, max: number, errors: ProfileFormErrors): string | null {
  const value = str(form, key).trim();
  if (value.length > max) errors[key] = "people.error.tooLong";
  return value || null;
}

/** "Log activity": kind, date (defaults to today), notes, optional CAP. */
export function parseEngagementForm(
  form: FormData,
): ProfileResult<{ kind: EngagementKind; happenedOn: string | null; notes: string | null; capId: string | null }> {
  const errors: ProfileFormErrors = {};
  const kind = oneOf(ENGAGEMENT_KINDS, form.get("kind"));
  if (!kind) errors.kind = "people.error.kind";
  const dateRaw = str(form, "happened_on").trim();
  if (dateRaw && !isoDate.safeParse(dateRaw).success) errors.happened_on = "people.error.date";
  const notes = limited(form, "notes", 4000, errors);
  const capRaw = str(form, "cap_id").trim();
  const capId = capRaw && capRaw !== "none" && id.safeParse(capRaw).success ? capRaw : null;
  if (!kind || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { kind, happenedOn: dateRaw || null, notes, capId } };
}

/** "Add a connection": the other person, the kind of link and a note. */
export function parseConnectionForm(
  form: FormData,
): ProfileResult<{ relatedPersonId: string; kind: RelationshipKind; note: string | null }> {
  const errors: ProfileFormErrors = {};
  const related = id.safeParse(str(form, "related_person_id"));
  if (!related.success) errors.related_person_id = "people.error.person";
  const kind = oneOf(RELATIONSHIP_KINDS, form.get("kind"));
  if (!kind) errors.kind = "people.error.relKind";
  const note = limited(form, "note", 500, errors);
  if (!related.success || !kind || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { relatedPersonId: related.data, kind, note } };
}

/** "Add to a CAP": which CAP and an optional role. */
export function parseCapPartnerForm(form: FormData): ProfileResult<{ capId: string; role: string | null }> {
  const errors: ProfileFormErrors = {};
  const cap = id.safeParse(str(form, "cap_id"));
  if (!cap.success) errors.cap_id = "people.error.cap";
  const role = limited(form, "role", 200, errors);
  if (!cap.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { capId: cap.data, role } };
}

/** An id posted with an admin action (engagement or relationship to remove). */
export function parseTargetId(form: FormData, key = "target_id"): string | null {
  const parsed = id.safeParse(str(form, key));
  return parsed.success ? parsed.data : null;
}

// ---------- directory filters (URL search params) ----------

export const PAGE_SIZE = 50;

/** What the directory's filter bar shows, read back from the URL. */
export type DirectoryParams = {
  q: string;
  types: ContributionType[];
  aff: Affiliation | "";
  /** "" = everyone except inactive (the default); "all" includes inactive. */
  status: PersonStatus | "all" | "";
  spanish: boolean;
  topic: string;
  page: number;
};

/** Reads ?q, ?type (repeatable), ?aff, ?status, ?lang=es, ?topic and ?page into a search filter. */
export function parseDirectoryParams(search: URLSearchParams): { params: DirectoryParams; filter: PeopleFilter } {
  const q = (search.get("q") ?? "").trim().slice(0, 200);
  const types = known(CONTRIBUTION_TYPES, search.getAll("type"));
  const aff = oneOf(AFFILIATIONS, search.get("aff")) ?? "";
  const statusRaw = search.get("status");
  const status = statusRaw === "all" ? "all" : (oneOf(PERSON_STATUSES, statusRaw) ?? "");
  const spanish = search.get("lang") === "es";
  const topic = normalizeTags(search.get("topic") ?? "")[0] ?? "";
  const pageNum = Number.parseInt(search.get("page") ?? "1", 10);
  const page = Number.isFinite(pageNum) ? Math.min(Math.max(pageNum, 1), 10_000) : 1;

  const filter: PeopleFilter = {
    q: q || undefined,
    contributionTypes: types.length ? types : undefined,
    affiliations: aff ? [aff] : undefined,
    statuses: status && status !== "all" ? [status] : undefined,
    includeInactive: status === "all",
    language: spanish ? "es" : undefined,
    capTopics: topic ? [topic] : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  return { params: { q, types, aff, status, spanish, topic, page }, filter };
}

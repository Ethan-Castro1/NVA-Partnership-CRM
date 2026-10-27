/**
 * The people directory (/app/people) and quick add (/app/people/new).
 *
 * One directory for both roles. Staff get "Browse People & Skills": the staff
 * directory only (searchPeople scopes it), ways to help, CAP topic and
 * language. Admins also filter by category, status, staff-directory
 * visibility, contact mode, relationship owner and how the record came in.
 *
 * Quick add is admin only: a few fields, an optional follow-up, and a
 * duplicate check that must be confirmed before a likely duplicate is saved.
 */
import { z } from "zod";
import type { MessageKey } from "~/i18n";
import {
  CONTACT_CATEGORIES,
  CONTACT_MODES,
  PAGE_SIZE,
  PERSON_SOURCES,
  type ContactCategory,
  type ContactMode,
  type PersonSource,
} from "./constants";
import { isIsoDate } from "./dates";
import { query, transaction } from "./db.server";
import { findDuplicates, normalizeEmail, normalizeName, phoneKey, type DuplicateCandidate } from "./duplicates.server";
import { createFollowUp } from "./follow-ups.server";
import { recordHistory } from "./history.server";
import { parseDirectoryParams, type DirectoryParams } from "./people-form.server";
import { createPerson, searchPeople, type PeopleFilter, type PersonInput, type SearchHit } from "./people.server";
import { isAdmin, visibleToSql, type Viewer } from "./permissions.server";
import { savedIdsAmong } from "./saved.server";

export type NamedOption = { id: string; name: string };

function forbidden(): never {
  throw new Response("Admins only", { status: 403, statusText: "Forbidden" });
}

function pick<T extends string>(vocab: readonly T[], values: unknown[]): T[] {
  const given = new Set(values.filter((v): v is string => typeof v === "string"));
  return vocab.filter((v) => given.has(v));
}

function oneOf<T extends string>(vocab: readonly T[], value: unknown): T | "" {
  return typeof value === "string" && (vocab as readonly string[]).includes(value) ? (value as T) : "";
}

// ---------- directory ----------

/** Everything the filter bar shows, read back from the URL. Admin-only fields are blank for staff. */
export type DirectorySearchParams = DirectoryParams & {
  categories: ContactCategory[];
  /** Staff directory on or off. */
  visibility: "on" | "off" | "";
  mode: ContactMode | "";
  owner: string;
  /** How the record came in (people.source). */
  source: PersonSource | "";
};

/**
 * Reads the directory URL: the shared params (?q, ?type, ?aff, ?status, ?lang,
 * ?topic, ?page) plus, for admins, ?cat (repeatable), ?vis=on|off,
 * ?mode=direct|introduction, ?owner=<user id> and ?source=<source>. Staff
 * params that only admins may use are dropped here and ignored again by
 * searchPeople.
 */
export function parseDirectorySearch(
  search: URLSearchParams,
  viewer: Viewer,
): { params: DirectorySearchParams; filter: PeopleFilter } {
  const base = parseDirectoryParams(search);
  if (!isAdmin(viewer)) {
    // Staff always see current people in the staff directory; status is a CRM detail.
    const { statuses: _s, includeInactive: _i, ...filter } = base.filter;
    return {
      params: { ...base.params, status: "", categories: [], visibility: "", mode: "", owner: "", source: "" },
      filter,
    };
  }
  const categories = pick(CONTACT_CATEGORIES, search.getAll("cat"));
  const visRaw = search.get("vis");
  const visibility = visRaw === "on" || visRaw === "off" ? visRaw : "";
  const mode = oneOf(CONTACT_MODES, search.get("mode"));
  const ownerRaw = (search.get("owner") ?? "").trim();
  const owner = /^[\w-]{1,100}$/.test(ownerRaw) && ownerRaw !== "any" ? ownerRaw : "";
  const source = oneOf(PERSON_SOURCES, search.get("source"));
  return {
    params: { ...base.params, categories, visibility, mode, owner, source },
    filter: {
      ...base.filter,
      categories: categories.length ? categories : undefined,
      directoryVisible: visibility ? visibility === "on" : undefined,
      contactMode: mode || undefined,
      ownerUserId: owner || undefined,
    },
  };
}

/** searchPeople has no source filter, so walk every match (200 at a time) and page the ones that came in that way. */
async function searchBySource(
  filter: PeopleFilter,
  viewer: Viewer,
  source: PersonSource,
): Promise<{ people: SearchHit[]; total: number }> {
  const step = 200;
  const all: SearchHit[] = [];
  for (let offset = 0; offset < 10_000; offset += step) {
    const page = await searchPeople({ ...filter, limit: step, offset }, viewer);
    all.push(...page.people.filter((p) => p.source === source));
    if (!page.people.length || offset + step >= page.total) break;
  }
  const from = filter.offset ?? 0;
  return { people: all.slice(from, from + (filter.limit ?? PAGE_SIZE)), total: all.length };
}

export type DirectoryData = {
  people: SearchHit[];
  total: number;
  params: DirectorySearchParams;
  /** CAP topics people in this viewer's directory have. */
  topics: string[];
  /** Everyone in this viewer's directory (not inactive). */
  directorySize: number;
  /** Which of `people` the viewer saved. */
  savedIds: string[];
  /** Admins only: who can own a relationship (the admins). Empty for staff. */
  owners: NamedOption[];
  isAdmin: boolean;
};

/** Loads one page of the directory for this viewer. */
export async function loadDirectory(viewer: Viewer, search: URLSearchParams): Promise<DirectoryData> {
  const admin = isAdmin(viewer);
  const { params, filter } = parseDirectorySearch(search, viewer);
  const visible = visibleToSql(viewer, "people");
  const [result, topicRows, everyone, owners] = await Promise.all([
    admin && params.source ? searchBySource(filter, viewer, params.source) : searchPeople(filter, viewer),
    query<{ topic: string }>(
      `SELECT DISTINCT t AS topic FROM people, unnest(cap_topics) t WHERE status <> 'inactive' AND ${visible} ORDER BY t LIMIT 200`,
    ),
    query<{ n: number }>(`SELECT count(*)::int AS n FROM people WHERE status <> 'inactive' AND ${visible}`),
    admin ? listOwners(viewer) : Promise.resolve([] as NamedOption[]),
  ]);
  const saved = await savedIdsAmong(
    viewer,
    result.people.map((p) => p.id),
  );
  return {
    people: result.people,
    total: result.total,
    params,
    topics: topicRows.map((r) => r.topic),
    directorySize: everyone[0]?.n ?? 0,
    savedIds: [...saved],
    owners,
    isAdmin: admin,
  };
}

/** Who can own a relationship: active admins. Admin only. */
export async function listOwners(viewer: Viewer): Promise<NamedOption[]> {
  if (!isAdmin(viewer)) forbidden();
  return query<NamedOption>("SELECT id, name FROM users WHERE role = 'admin' AND active ORDER BY lower(name)");
}

// ---------- quick add ----------

export const QUICK_ADD_FIELDS = [
  "full_name",
  "organization_name",
  "email",
  "phone",
  "notes",
  "title",
  "origin",
  "owner_user_id",
  "follow_up_on",
  "follow_up_action",
] as const;
export type QuickAddField = (typeof QUICK_ADD_FIELDS)[number];

export type QuickAddErrorKey = Extract<
  MessageKey,
  | "directory.quick.errorName"
  | "directory.quick.errorEmail"
  | "directory.quick.errorTooLong"
  | "directory.quick.errorDate"
  | "directory.quick.errorAction"
  | "directory.quick.errorDateNeeded"
  | "directory.quick.errorOwner"
>;
export type QuickAddErrors = Partial<Record<QuickAddField, QuickAddErrorKey>>;

export type QuickAddInput = {
  person: PersonInput & {
    email: string | null;
    phone: string | null;
    organization_name: string | null;
    categories: ContactCategory[];
    directory_visible: boolean;
    contact_mode: ContactMode;
    owner_user_id: string | null;
  };
  followUp: { dueOn: string; action: string } | null;
};

const TOO_LONG: QuickAddErrorKey = "directory.quick.errorTooLong";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: TOO_LONG })
    .transform((v) => v || null);

const quickSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, { error: "directory.quick.errorName" satisfies QuickAddErrorKey })
    .max(200, { error: TOO_LONG }),
  organization_name: text(200),
  email: z
    .string()
    .trim()
    .max(254, { error: TOO_LONG })
    .refine((v) => v === "" || z.email().safeParse(v).success, {
      error: "directory.quick.errorEmail" satisfies QuickAddErrorKey,
    })
    .transform((v) => v.toLowerCase() || null),
  phone: text(40),
  notes: text(4000),
  title: text(200),
  origin: text(500),
  owner_user_id: z
    .string()
    .trim()
    .max(100, { error: "directory.quick.errorOwner" satisfies QuickAddErrorKey })
    .transform((v) => (v && v !== "none" ? v : null)),
  follow_up_on: z
    .string()
    .trim()
    .refine((v) => v === "" || isIsoDate(v), { error: "directory.quick.errorDate" satisfies QuickAddErrorKey }),
  follow_up_action: text(500),
});

/**
 * Reads the quick add form. Only the name is required. New contacts start
 * hidden from staff and introduction-only unless the admin chose otherwise.
 * A follow-up needs both a date and an action, or neither.
 */
export function parseQuickAddForm(form: FormData): { ok: true; input: QuickAddInput } | { ok: false; errors: QuickAddErrors } {
  const raw = Object.fromEntries(
    QUICK_ADD_FIELDS.map((field) => {
      const value = form.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  );
  const parsed = quickSchema.safeParse(raw);
  const errors: QuickAddErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as QuickAddField;
      errors[field] ??= issue.message as QuickAddErrorKey;
    }
    return { ok: false, errors };
  }
  const v = parsed.data;
  if (v.follow_up_on && !v.follow_up_action) errors.follow_up_action = "directory.quick.errorAction";
  if (v.follow_up_action && !v.follow_up_on) errors.follow_up_on = "directory.quick.errorDateNeeded";
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    input: {
      person: {
        full_name: v.full_name,
        organization_name: v.organization_name,
        email: v.email,
        phone: v.phone,
        notes: v.notes,
        title: v.title,
        origin: v.origin,
        owner_user_id: v.owner_user_id,
        categories: pick(CONTACT_CATEGORIES, form.getAll("categories")),
        directory_visible: form.get("directory_visible") === "on",
        contact_mode: oneOf(CONTACT_MODES, form.get("contact_mode")) || "introduction",
        status: "new",
        source: "admin",
      },
      followUp: v.follow_up_on && v.follow_up_action ? { dueOn: v.follow_up_on, action: v.follow_up_action } : null,
    },
  };
}

/**
 * The fields the duplicate check looked at, folded. "Save anyway" carries it
 * back, so a confirmation only counts for the exact details that were checked.
 */
export function duplicateFingerprint(person: Pick<PersonInput, "full_name" | "email" | "phone" | "organization_name">): string {
  return [normalizeName(person.full_name), normalizeEmail(person.email), phoneKey(person.phone), normalizeName(person.organization_name)].join("|");
}

export type QuickAddResult =
  | { status: "created"; personId: string; followUpId: string | null }
  | { status: "duplicates"; duplicates: DuplicateCandidate[]; fingerprint: string }
  | { status: "invalid"; errors: QuickAddErrors };

/**
 * Adds a contact from quick add (admins only). Unless `confirmed` matches the
 * fingerprint of these details, a possible duplicate stops the save and comes
 * back for the admin to open or to confirm with "Save anyway". On save it
 * records a contact_created history entry and, when asked, a follow-up.
 */
export async function quickAddContact(
  actor: Viewer,
  input: QuickAddInput,
  options: { confirmed?: string | null } = {},
): Promise<QuickAddResult> {
  if (!isAdmin(actor)) forbidden();
  const { person, followUp } = input;

  if (person.owner_user_id) {
    const owner = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'admin'", [person.owner_user_id]);
    if (!owner.length) return { status: "invalid", errors: { owner_user_id: "directory.quick.errorOwner" } };
  }

  const fingerprint = duplicateFingerprint(person);
  if (options.confirmed !== fingerprint) {
    const duplicates = await findDuplicates(person, { limit: 5 });
    if (duplicates.length) return { status: "duplicates", duplicates, fingerprint };
  }

  const personId = await transaction(async (tx) => {
    const id = await createPerson(person, actor.id, tx);
    await recordHistory(
      { personId: id, kind: "contact_created", origin: "system", visibility: "admin", userId: actor.id, meta: { via: "quick_add" } },
      tx,
    );
    return id;
  });
  const followUpId = followUp
    ? await createFollowUp(actor, {
        personId,
        action: followUp.action,
        dueOn: followUp.dueOn,
        ownerUserId: person.owner_user_id ?? actor.id,
      })
    : null;
  return { status: "created", personId, followUpId };
}

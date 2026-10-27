/**
 * The public "Join the village" form and the admin review queue behind it:
 * reading and validating what visitors send, a small spam guard, saving each
 * sign-up for review, and the review decisions (approve as a new person, link
 * to an existing record, edit first, or reject). Only an approval creates CRM
 * records (the person, their referrer and the people they suggest).
 */
import { z } from "zod";
import {
  REFERRAL_SLOTS,
  isBlankReferral,
  type IntakeErrors,
  type IntakeFormValues,
  type ReferralRowValues,
} from "~/components/intake/form-types";
import { translate, type Locale, type MessageKey } from "~/i18n";
import { effectivePayload } from "./admin.server";
import {
  CONTRIBUTION_TYPES,
  LANGUAGES,
  PUBLIC_CONTRIBUTION_TYPES,
  SUGGESTED_CAP_TOPICS,
  normalizeTags,
  type Affiliation,
  type ContributionType,
  type IntakeStatus,
} from "./constants";
import { schoolToday } from "./dates";
import { newId, query, transaction, type Queryable } from "./db.server";
import { findDuplicates } from "./duplicates.server";
import { recordHistory } from "./history.server";
import type { IntakePayload, IntakeReferral } from "./intake-types";
import { addRelationship, createPerson, findPersonByEmail, updatePerson, type PersonInput } from "./people.server";
import { isAdmin, type Viewer } from "./permissions.server";

import { HONEYPOT_FIELD, PUBLIC_AFFILIATIONS } from "./intake-types";
export { HONEYPOT_FIELD, PUBLIC_AFFILIATIONS };

// ---------- reading the form ----------

const str = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/** Keeps only values from a known list, so unknown enum values are ignored. */
const known = <T extends string>(values: FormDataEntryValue[], allowed: readonly T[]): T[] => [
  ...new Set(values.filter((v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v))),
];

export function readIntakeForm(form: FormData): IntakeFormValues {
  const referrals: ReferralRowValues[] = Array.from({ length: REFERRAL_SLOTS }, (_, i) => ({
    name: str(form, `ref_name_${i}`),
    contact: str(form, `ref_contact_${i}`),
    how_known: str(form, `ref_how_${i}`),
    can_help_with: str(form, `ref_help_${i}`),
  }));
  return {
    full_name: str(form, "full_name"),
    email: str(form, "email"),
    phone: str(form, "phone"),
    preferred_language: str(form, "preferred_language"),
    organization: str(form, "organization"),
    title: str(form, "title"),
    contribution_types: known(form.getAll("contribution_types"), PUBLIC_CONTRIBUTION_TYPES),
    skills: str(form, "skills"),
    other_help: str(form, "other_help"),
    cap_topics: known(form.getAll("cap_topics"), SUGGESTED_CAP_TOPICS),
    cap_topics_other: str(form, "cap_topics_other"),
    availability: str(form, "availability"),
    bio: str(form, "bio"),
    affiliations: known(form.getAll("affiliations"), PUBLIC_AFFILIATIONS),
    referred_by_name: str(form, "referred_by_name"),
    referred_by_email: str(form, "referred_by_email"),
    referrals,
    consent: str(form, "consent") === "on",
  };
}

export function isHoneypotFilled(form: FormData): boolean {
  return str(form, HONEYPOT_FIELD).trim() !== "";
}

// ---------- validation ----------

const TOO_LONG = "intake.error.tooLong" satisfies MessageKey;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalText = (max: number) => z.string().trim().max(max, TOO_LONG);
const optionalEmail = z
  .string()
  .trim()
  .max(200, TOO_LONG)
  .refine((v) => v === "" || EMAIL_RE.test(v), "intake.error.emailInvalid" satisfies MessageKey);

const referralSchema = z
  .object({
    name: optionalText(120),
    contact: optionalText(200),
    how_known: optionalText(300),
    can_help_with: optionalText(500),
  })
  .superRefine((row, ctx) => {
    if (isBlankReferral(row)) return;
    if (!row.name) ctx.addIssue({ code: "custom", path: ["name"], message: "intake.error.referralNameRequired" });
    // One box for "email or phone": an @ means email, otherwise it needs enough digits to dial.
    const contact = row.contact;
    const valid = contact.includes("@") ? EMAIL_RE.test(contact) : contact === "" || contact.replace(/\D/g, "").length >= 7;
    if (!valid) ctx.addIssue({ code: "custom", path: ["contact"], message: "intake.error.contactInvalid" });
  });

const intakeSchema = z
  .object({
    full_name: z.string().trim().min(1, "intake.error.nameRequired" satisfies MessageKey).max(120, TOO_LONG),
    email: z
      .string()
      .trim()
      .min(1, "intake.error.emailRequired" satisfies MessageKey)
      .max(200, TOO_LONG)
      .refine((v) => v === "" || EMAIL_RE.test(v), "intake.error.emailInvalid" satisfies MessageKey),
    phone: optionalText(40),
    preferred_language: z.string(),
    organization: z.string().trim().min(1, "intake.error.organizationRequired" satisfies MessageKey).max(160, TOO_LONG),
    title: optionalText(120),
    contribution_types: z
      .array(z.enum(PUBLIC_CONTRIBUTION_TYPES))
      .min(1, "intake.error.contributionRequired" satisfies MessageKey),
    skills: optionalText(500),
    other_help: optionalText(1000),
    cap_topics: z.array(z.string().max(60)).max(20),
    cap_topics_other: optionalText(300),
    availability: optionalText(500),
    bio: optionalText(2000),
    affiliations: z.array(z.enum(PUBLIC_AFFILIATIONS)),
    referred_by_name: optionalText(120),
    referred_by_email: optionalEmail,
    referrals: z.array(referralSchema).max(REFERRAL_SLOTS),
    consent: z.literal(true, "intake.error.consentRequired" satisfies MessageKey),
  })
  .superRefine((v, ctx) => {
    if (v.contribution_types.includes("other") && !v.other_help)
      ctx.addIssue({ code: "custom", path: ["other_help"], message: "intake.error.otherRequired" });
    if (v.referred_by_email && !v.referred_by_name)
      ctx.addIssue({ code: "custom", path: ["referred_by_name"], message: "intake.error.referralNameRequired" });
  });

const nullable = (v: string) => (v.trim() ? v.trim() : null);

function toReferral(row: ReferralRowValues): IntakeReferral {
  const contact = row.contact.trim();
  const isEmail = contact.includes("@");
  return {
    name: row.name.trim(),
    email: isEmail ? contact.toLowerCase() : null,
    phone: !isEmail && contact ? contact : null,
    how_known: nullable(row.how_known),
    can_help_with: nullable(row.can_help_with),
    kind: "knows",
  };
}

export type IntakeValidation = { ok: true; payload: IntakePayload } | { ok: false; errors: IntakeErrors };

/** Server-side validation. Errors are i18n keys keyed by field path ("referrals.1.contact"). */
export function validateIntake(values: IntakeFormValues, locale: Locale): IntakeValidation {
  const parsed = intakeSchema.safeParse(values);
  if (!parsed.success) {
    const errors: IntakeErrors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "_form";
      if (!errors[path]) errors[path] = (issue.message.startsWith("intake.") ? issue.message : "intake.error.check") as MessageKey;
    }
    return { ok: false, errors };
  }
  const v = parsed.data;
  const language = (LANGUAGES as readonly string[]).includes(v.preferred_language)
    ? (v.preferred_language as IntakePayload["preferred_language"])
    : locale;
  return {
    ok: true,
    payload: {
      full_name: v.full_name,
      email: v.email.toLowerCase(),
      phone: nullable(v.phone),
      preferred_language: language,
      organization: nullable(v.organization),
      title: nullable(v.title),
      contribution_types: v.contribution_types,
      skills: normalizeTags(v.skills).slice(0, 30),
      other_help: v.contribution_types.includes("other") ? nullable(v.other_help) : null,
      cap_topics: normalizeTags([...v.cap_topics, ...normalizeTags(v.cap_topics_other)]).slice(0, 20),
      availability: nullable(v.availability),
      bio: nullable(v.bio),
      affiliations: v.affiliations,
      referred_by: v.referred_by_name ? { name: v.referred_by_name, email: nullable(v.referred_by_email)?.toLowerCase() ?? null } : null,
      referrals: values.referrals.filter((row) => !isBlankReferral(row)).map(toReferral),
      consent: true,
    },
  };
}

// ---------- spam guard ----------

const RATE_WINDOW_MS = 60 * 60 * 1000;
export const RATE_MAX = 10;
// Survives dev-server hot reloads like the database handle does.
const globalForRate = globalThis as unknown as { __nvaIntakeRate?: Map<string, { count: number; resetAt: number }> };
const submissions = (globalForRate.__nvaIntakeRate ??= new Map());

/** True when this IP has already sent RATE_MAX sign-ups in the past hour. */
export function isIntakeRateLimited(ip: string, now = Date.now()): boolean {
  const entry = submissions.get(ip);
  return !!entry && entry.resetAt > now && entry.count >= RATE_MAX;
}

export function recordIntakeAttempt(ip: string, now = Date.now()): void {
  const entry = submissions.get(ip);
  if (!entry || entry.resetAt <= now) submissions.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  else entry.count += 1;
  // Keep the map small on a long-running server.
  if (submissions.size > 5000) {
    for (const [key, value] of submissions) if (value.resetAt <= now) submissions.delete(key);
  }
}


// ---------- saving a submission ----------

/**
 * Saves one public sign-up for review, exactly as sent. Nothing else is
 * created yet: the person, whoever referred them and the people they suggest
 * are added only when an admin approves the sign-up (or links it to someone
 * already in the CRM). The strongest existing match (same email or phone) is
 * remembered so the review queue can flag it.
 */
export async function processIntake(
  payload: IntakePayload,
  locale: Locale,
): Promise<{ submissionId: string; matchedPersonId: string | null }> {
  const [best] = await findDuplicates(
    { full_name: payload.full_name, email: payload.email, phone: payload.phone, organization_name: payload.organization },
    { limit: 1 },
  );
  const matchedPersonId = best && (best.reasons.includes("email") || best.reasons.includes("phone")) ? best.id : null;
  const submissionId = newId();
  await query(
    "INSERT INTO intake_submissions (id, person_id, matched_person_id, payload, locale) VALUES ($1, NULL, $2, $3, $4)",
    [submissionId, matchedPersonId, JSON.stringify(payload), locale],
  );
  return { submissionId, matchedPersonId };
}

// ---------- reviewing a submission (admins only) ----------

export type ReviewError = Extract<
  MessageKey,
  "admin.error.signupNotFound" | "admin.error.alreadyDecided" | "admin.error.personNotFound" | "admin.error.profileInUse"
>;
export type ReviewResult = { ok: true; personId: string | null } | { ok: false; error: ReviewError };

const fail = (error: ReviewError): ReviewResult => ({ ok: false, error });

/** Every review function checks the role itself too, so no caller can skip it. */
function assertAdmin(viewer: Viewer): void {
  if (!isAdmin(viewer)) throw new Response("Admins only", { status: 403, statusText: "Forbidden" });
}

type SubmissionRow = {
  id: string;
  status: IntakeStatus;
  person_id: string | null;
  payload: unknown;
  edited_payload: unknown;
  locale: string;
  submitted_at: Date | string;
};

const asLocale = (value: string): Locale => (value === "es" ? "es" : "en");

async function lockSubmission(id: string, tx: Queryable): Promise<SubmissionRow | null> {
  const [row] = await tx.query<SubmissionRow>(
    `SELECT id, status, person_id, payload, edited_payload, locale, submitted_at
       FROM intake_submissions WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return row ?? null;
}

async function personExists(id: string, tx: Queryable): Promise<boolean> {
  return (await tx.query("SELECT 1 FROM people WHERE id = $1", [id])).length > 0;
}

/** The person fields a sign-up fills in. */
function personFields(payload: IntakePayload): Partial<PersonInput> & { full_name: string } {
  return {
    full_name: payload.full_name,
    email: payload.email || null,
    phone: payload.phone ?? null,
    preferred_language: payload.preferred_language,
    organization_name: payload.organization ?? null,
    title: payload.title ?? null,
    bio: payload.bio ?? null,
    skills: payload.skills,
    cap_topics: payload.cap_topics,
    contribution_types: payload.contribution_types,
    affiliations: payload.affiliations,
    availability: payload.availability ?? null,
  };
}

/** "Something else" answers go in the private notes, in the submitter's language. */
function otherHelpNote(payload: IntakePayload, locale: Locale): string | null {
  return payload.other_help ? translate(locale, "intake.note.otherHelp", { text: payload.other_help }) : null;
}

async function markDecided(
  tx: Queryable,
  id: string,
  status: Exclude<IntakeStatus, "new">,
  adminId: string,
  extra: { personId?: string | null; note?: string | null } = {},
): Promise<void> {
  await tx.query(
    `UPDATE intake_submissions
        SET status = $2, decided_by = $3, decided_at = now(), reviewed_by = $3, reviewed_at = now(),
            decision_note = $4, person_id = coalesce($5, person_id), matched_person_id = coalesce($5, matched_person_id)
      WHERE id = $1`,
    [id, status, adminId, extra.note?.trim() ? extra.note.trim().slice(0, 2000) : null, extra.personId ?? null],
  );
}

async function recordSignupSubmitted(personId: string, row: SubmissionRow, tx: Queryable): Promise<void> {
  const submitted = row.submitted_at instanceof Date ? row.submitted_at : new Date(String(row.submitted_at));
  await recordHistory(
    {
      personId,
      kind: "signup_submitted",
      origin: "system",
      visibility: "admin",
      happenedOn: Number.isNaN(submitted.getTime()) ? null : schoolToday(submitted),
      meta: { submissionId: row.id },
    },
    tx,
  );
}

async function findPersonByName(name: string, tx: Queryable): Promise<{ id: string } | null> {
  const rows = await tx.query<{ id: string }>(
    "SELECT id FROM people WHERE lower(full_name) = lower($1) ORDER BY created_at ASC LIMIT 1",
    [name.trim()],
  );
  return rows[0] ?? null;
}

/**
 * Who referred them and the people they suggested: matched to existing
 * records by email (and the referrer by name), otherwise added as hidden leads.
 */
async function addReferrals(personId: string, payload: IntakePayload, locale: Locale, adminId: string, tx: Queryable): Promise<void> {
  const note = (key: MessageKey, vars: Record<string, string>) => translate(locale, key, vars);

  if (payload.referred_by?.name.trim()) {
    const { name, email } = payload.referred_by;
    const match = (email ? await findPersonByEmail(email, tx) : null) ?? (await findPersonByName(name, tx));
    const referrerId =
      match?.id ??
      (await createPerson(
        {
          full_name: name,
          email: email ?? null,
          status: "lead",
          source: "referral",
          contribution_types: [],
          notes: note("intake.note.referredSomeone", { name: payload.full_name }),
        },
        adminId,
        tx,
      ));
    await addRelationship({ personId: referrerId, relatedPersonId: personId, kind: "referred", source: "intake" }, adminId, tx);
  }

  for (const referral of payload.referrals) {
    if (!referral.name.trim()) continue;
    if (referral.email && payload.email && referral.email.toLowerCase() === payload.email.toLowerCase()) continue;
    const match = referral.email ? await findPersonByEmail(referral.email, tx) : null;
    const leadNotes = [
      referral.can_help_with ? note("intake.note.canHelpWith", { text: referral.can_help_with }) : null,
      note("intake.note.suggestedBy", { name: payload.full_name }),
    ]
      .filter(Boolean)
      .join("\n");
    const referralId =
      match?.id ??
      (await createPerson(
        {
          full_name: referral.name,
          email: referral.email ?? null,
          phone: referral.phone ?? null,
          status: "lead",
          source: "referral",
          contribution_types: [],
          notes: leadNotes,
        },
        adminId,
        tx,
      ));
    await addRelationship(
      { personId, relatedPersonId: referralId, kind: referral.kind ?? "knows", note: referral.how_known ?? null, source: "intake" },
      adminId,
      tx,
    );
  }
}

type ExistingPerson = {
  email: string | null;
  phone: string | null;
  title: string | null;
  bio: string | null;
  availability: string | null;
  notes: string | null;
  organization_id: string | null;
  skills: string[];
  cap_topics: string[];
  contribution_types: ContributionType[];
  affiliations: Affiliation[];
};

const union = <T,>(a: readonly T[], b: readonly T[]): T[] => [...new Set([...a, ...b])];
const isEmpty = (v: string | null | undefined) => !v || !v.trim();

/** Fills gaps on someone already in the CRM: unions the lists, never overwrites text an admin entered. */
async function mergeIntoExisting(personId: string, payload: IntakePayload, otherNote: string | null, tx: Queryable): Promise<void> {
  const [row] = await tx.query<ExistingPerson>(
    `SELECT email, phone, title, bio, availability, notes, organization_id, skills, cap_topics, contribution_types, affiliations
       FROM people WHERE id = $1`,
    [personId],
  );
  if (!row) return;
  await updatePerson(
    personId,
    {
      skills: union(row.skills, payload.skills),
      cap_topics: union(row.cap_topics, payload.cap_topics),
      contribution_types: union(row.contribution_types, payload.contribution_types),
      affiliations: union(row.affiliations, payload.affiliations),
      ...(isEmpty(row.email) && payload.email ? { email: payload.email } : {}),
      ...(isEmpty(row.phone) && payload.phone ? { phone: payload.phone } : {}),
      ...(isEmpty(row.title) && payload.title ? { title: payload.title } : {}),
      ...(isEmpty(row.bio) && payload.bio ? { bio: payload.bio } : {}),
      ...(isEmpty(row.availability) && payload.availability ? { availability: payload.availability } : {}),
      ...(otherNote && !(row.notes ?? "").includes(otherNote) ? { notes: [row.notes?.trim(), otherNote].filter(Boolean).join("\n") } : {}),
      ...(!row.organization_id && payload.organization ? { organization_name: payload.organization } : {}),
      // An approved sign-up is someone working with NVA now.
      status: "active",
    },
    tx,
  );
}

/**
 * Sign-ups saved before the review queue made their own hidden contact right
 * away. When such a sign-up is linked to an existing record, that untouched
 * contact is folded into it (history and links move over) and removed. Returns
 * false when the contact has been worked on since, so it is left alone.
 */
async function absorbSignupPerson(fromId: string, intoId: string, tx: Queryable): Promise<boolean> {
  const [person] = await tx.query<{ source: string; directory_visible: boolean }>(
    "SELECT source, directory_visible FROM people WHERE id = $1",
    [fromId],
  );
  if (!person || person.source !== "intake" || person.directory_visible) return false;
  const [{ n }] = await tx.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM engagements WHERE person_id = $1 AND kind NOT IN ('signup_submitted', 'contact_created')",
    [fromId],
  );
  if (Number(n) > 0) return false;

  // Links the target already has (or links to the target itself) are dropped with the old contact.
  await tx.query(
    `UPDATE relationships r SET person_id = $2
      WHERE r.person_id = $1 AND r.related_person_id <> $2
        AND NOT EXISTS (SELECT 1 FROM relationships x WHERE x.person_id = $2 AND x.related_person_id = r.related_person_id AND x.kind = r.kind)`,
    [fromId, intoId],
  );
  await tx.query(
    `UPDATE relationships r SET related_person_id = $2
      WHERE r.related_person_id = $1 AND r.person_id <> $2
        AND NOT EXISTS (SELECT 1 FROM relationships x WHERE x.related_person_id = $2 AND x.person_id = r.person_id AND x.kind = r.kind)`,
    [fromId, intoId],
  );
  await tx.query("UPDATE engagements SET person_id = $2 WHERE person_id = $1", [fromId, intoId]);
  await tx.query("UPDATE intake_submissions SET person_id = $2 WHERE person_id = $1", [fromId, intoId]);
  await tx.query("DELETE FROM people WHERE id = $1", [fromId]);
  return true;
}

/**
 * Approves a new sign-up as a new person. Following owner decision 1 they
 * start hidden from staff with introduction-only contact, unless the admin
 * chooses to show them in the staff directory (contact stays by introduction
 * either way; the admin can change it on the profile). Records the sign-up and
 * the new contact in their history, and adds their referrer and suggestions.
 */
export async function approveIntake(
  admin: Viewer,
  submissionId: string,
  options: { showInDirectory?: boolean } = {},
): Promise<ReviewResult> {
  assertAdmin(admin);
  const show = options.showInDirectory === true;
  return transaction(async (tx) => {
    const row = await lockSubmission(submissionId, tx);
    if (!row) return fail("admin.error.signupNotFound");
    if (row.status !== "new") return fail("admin.error.alreadyDecided");
    const payload = effectivePayload(row);
    const locale = asLocale(row.locale);

    let personId: string;
    if (row.person_id && (await personExists(row.person_id, tx))) {
      // Saved before the review queue: its hidden contact already exists, so bring it up to date.
      personId = row.person_id;
      await updatePerson(
        personId,
        { ...(row.edited_payload ? personFields(payload) : {}), status: "active", ...(show ? { directory_visible: true } : {}) },
        tx,
      );
    } else {
      personId = await createPerson(
        {
          ...personFields(payload),
          notes: otherHelpNote(payload, locale),
          status: "active",
          source: "intake",
          directory_visible: show,
          contact_mode: "introduction",
        },
        admin.id,
        tx,
      );
      await recordSignupSubmitted(personId, row, tx);
      await recordHistory(
        { personId, kind: "contact_created", origin: "system", visibility: "admin", userId: admin.id, meta: { submissionId } },
        tx,
      );
      await addReferrals(personId, payload, locale, admin.id, tx);
    }

    await recordHistory(
      {
        personId,
        kind: "signup_approved",
        origin: "system",
        visibility: "admin",
        userId: admin.id,
        meta: { submissionId, directoryVisible: show },
      },
      tx,
    );
    await markDecided(tx, submissionId, "approved", admin.id, { personId });
    return { ok: true, personId };
  });
}

/**
 * Links a new sign-up to someone already in the CRM instead of adding a
 * duplicate: fills the gaps on their record (lists are combined, text an admin
 * typed is kept), marks them active, and records the sign-up in their history.
 * Showing them in the staff directory is opt-in; an already visible person stays visible.
 */
export async function linkIntake(
  admin: Viewer,
  submissionId: string,
  personId: string,
  options: { showInDirectory?: boolean } = {},
): Promise<ReviewResult> {
  assertAdmin(admin);
  return transaction(async (tx) => {
    const row = await lockSubmission(submissionId, tx);
    if (!row) return fail("admin.error.signupNotFound");
    if (row.status !== "new") return fail("admin.error.alreadyDecided");
    if (!(await personExists(personId, tx))) return fail("admin.error.personNotFound");
    const payload = effectivePayload(row);
    const locale = asLocale(row.locale);

    const ownContact = row.person_id && row.person_id !== personId && (await personExists(row.person_id, tx)) ? row.person_id : null;
    if (ownContact && !(await absorbSignupPerson(ownContact, personId, tx))) return fail("admin.error.profileInUse");

    await mergeIntoExisting(personId, payload, otherHelpNote(payload, locale), tx);
    if (options.showInDirectory === true) await updatePerson(personId, { directory_visible: true }, tx);
    // Older sign-ups already recorded this (and their referrals) when they were sent.
    if (!row.person_id) {
      await recordSignupSubmitted(personId, row, tx);
      await addReferrals(personId, payload, locale, admin.id, tx);
    }
    await recordHistory(
      {
        personId,
        kind: "signup_approved",
        origin: "system",
        visibility: "admin",
        userId: admin.id,
        meta: { submissionId, linked: true, directoryVisible: options.showInDirectory === true },
      },
      tx,
    );
    await markDecided(tx, submissionId, "approved", admin.id, { personId });
    return { ok: true, personId };
  });
}

/** Rejects a new sign-up, with an optional private note. No contact is created. */
export async function rejectIntake(admin: Viewer, submissionId: string, note?: string | null): Promise<ReviewResult> {
  assertAdmin(admin);
  return transaction(async (tx) => {
    const row = await lockSubmission(submissionId, tx);
    if (!row) return fail("admin.error.signupNotFound");
    if (row.status !== "new") return fail("admin.error.alreadyDecided");
    await markDecided(tx, submissionId, "rejected", admin.id, { note });
    return { ok: true, personId: null };
  });
}

/** Saves the admin's corrections. The sign-up as sent stays untouched next to them. */
export async function saveIntakeEdits(admin: Viewer, submissionId: string, edited: IntakePayload): Promise<ReviewResult> {
  assertAdmin(admin);
  return transaction(async (tx) => {
    const row = await lockSubmission(submissionId, tx);
    if (!row) return fail("admin.error.signupNotFound");
    if (row.status !== "new") return fail("admin.error.alreadyDecided");
    await tx.query("UPDATE intake_submissions SET edited_payload = $2 WHERE id = $1", [submissionId, JSON.stringify(edited)]);
    return { ok: true, personId: null };
  });
}

export type IntakeEditErrors = Partial<Record<"full_name" | "email" | "phone" | "_form", MessageKey>>;

const editSchema = z.object({
  full_name: z.string().trim().min(1, "admin.error.nameRequired" satisfies MessageKey).max(120, TOO_LONG),
  email: optionalEmail,
  phone: optionalText(40),
  organization: optionalText(160),
  title: optionalText(120),
  skills: optionalText(1000),
  availability: optionalText(500),
  bio: optionalText(2000),
});

/**
 * Reads the "Edit before approving" form over the payload being edited. Only
 * the fields on that form change; referrals and consent stay as sent.
 */
export function readIntakeEdits(
  form: FormData,
  base: IntakePayload,
): { ok: true; payload: IntakePayload } | { ok: false; errors: IntakeEditErrors } {
  const parsed = editSchema.safeParse({
    full_name: str(form, "full_name"),
    email: str(form, "email"),
    phone: str(form, "phone"),
    organization: str(form, "organization"),
    title: str(form, "title"),
    skills: str(form, "skills"),
    availability: str(form, "availability"),
    bio: str(form, "bio"),
  });
  if (!parsed.success) {
    const errors: IntakeEditErrors = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "_form") as keyof IntakeEditErrors;
      if (!errors[field]) errors[field] = (issue.message.includes(".") ? issue.message : "admin.error.invalid") as MessageKey;
    }
    return { ok: false, errors };
  }
  const v = parsed.data;
  const language = str(form, "preferred_language");
  return {
    ok: true,
    payload: {
      ...base,
      full_name: v.full_name,
      email: v.email.toLowerCase(),
      phone: nullable(v.phone),
      organization: nullable(v.organization),
      title: nullable(v.title),
      preferred_language: (LANGUAGES as readonly string[]).includes(language) ? (language as IntakePayload["preferred_language"]) : base.preferred_language,
      contribution_types: known(form.getAll("contribution_types"), CONTRIBUTION_TYPES),
      skills: normalizeTags(v.skills).slice(0, 30),
      availability: nullable(v.availability),
      bio: nullable(v.bio),
    },
  };
}

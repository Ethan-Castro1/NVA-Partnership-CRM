/**
 * The public "Join the village" form: reading and validating what visitors
 * send, a small spam guard, and turning a submission into CRM records
 * (the person, their referrer, and the people they suggest) in one transaction.
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
import {
  LANGUAGES,
  PUBLIC_CONTRIBUTION_TYPES,
  SUGGESTED_CAP_TOPICS,
  normalizeTags,
  type Affiliation,
  type ContributionType,
} from "./constants";
import { newId, transaction, type Queryable } from "./db.server";
import type { IntakePayload, IntakeReferral } from "./intake-types";
import { addRelationship, createPerson, findPersonByEmail, updatePerson } from "./people.server";

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
    cap_topics: z.array(z.enum(SUGGESTED_CAP_TOPICS)),
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
      // The form only shows these fields for the ways to help they belong to.
      skills: v.contribution_types.some((type) => type === "skills_lesson" || type === "after_school")
        ? normalizeTags(v.skills).slice(0, 30)
        : [],
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

// ---------- turning a submission into records ----------

type ExistingPerson = {
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
  status: string;
};

const union = <T,>(a: readonly T[], b: readonly T[]): T[] => [...new Set([...a, ...b])];
const isEmpty = (v: string | null | undefined) => !v || !v.trim();

/** Fills gaps on someone already in the CRM: unions the lists, never overwrites text staff entered. */
async function mergeIntoExisting(personId: string, payload: IntakePayload, otherNote: string | null, tx: Queryable): Promise<void> {
  const [row] = await tx.query<ExistingPerson>(
    `SELECT phone, title, bio, availability, notes, organization_id, skills, cap_topics, contribution_types, affiliations, status
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
      ...(isEmpty(row.phone) && payload.phone ? { phone: payload.phone } : {}),
      ...(isEmpty(row.title) && payload.title ? { title: payload.title } : {}),
      ...(isEmpty(row.bio) && payload.bio ? { bio: payload.bio } : {}),
      ...(isEmpty(row.availability) && payload.availability ? { availability: payload.availability } : {}),
      ...(otherNote ? { notes: [row.notes?.trim(), otherNote].filter(Boolean).join("\n") } : {}),
      ...(!row.organization_id && payload.organization ? { organization_name: payload.organization } : {}),
      // A lead someone suggested (or a past partner) who now signs up themselves is a new sign-up.
      ...(row.status === "lead" || row.status === "inactive" ? { status: "new" as const } : {}),
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
 * Saves one public sign-up: the person (new or merged by email), the
 * submission as sent, who referred them, and a lead for each person they
 * suggested. Notes written for staff use the submitter's language.
 */
export async function processIntake(
  payload: IntakePayload,
  locale: Locale,
): Promise<{ personId: string; submissionId: string }> {
  const note = (key: MessageKey, vars: Record<string, string>) => translate(locale, key, vars);

  // "Something else" answers go in the notes, where staff will read them.
  const otherNote = payload.other_help ? note("intake.note.otherHelp", { text: payload.other_help }) : null;

  return transaction(async (tx) => {
    const existing = await findPersonByEmail(payload.email, tx);
    let personId: string;
    if (existing) {
      personId = existing.id;
      await mergeIntoExisting(personId, payload, otherNote, tx);
    } else {
      personId = await createPerson(
        {
          full_name: payload.full_name,
          email: payload.email,
          phone: payload.phone,
          preferred_language: payload.preferred_language,
          organization_name: payload.organization,
          title: payload.title,
          bio: payload.bio,
          skills: payload.skills,
          cap_topics: payload.cap_topics,
          contribution_types: payload.contribution_types,
          affiliations: payload.affiliations,
          availability: payload.availability,
          notes: otherNote,
          status: "new",
          source: "intake",
        },
        null,
        tx,
      );
    }

    const submissionId = newId();
    await tx.query("INSERT INTO intake_submissions (id, person_id, payload, locale) VALUES ($1, $2, $3, $4)", [
      submissionId,
      personId,
      JSON.stringify(payload),
      locale,
    ]);

    if (payload.referred_by?.name.trim()) {
      const { name, email } = payload.referred_by;
      const match =
        (email ? await findPersonByEmail(email, tx) : null) ?? (await findPersonByName(name, tx));
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
          null,
          tx,
        ));
      await addRelationship({ personId: referrerId, relatedPersonId: personId, kind: "referred", source: "intake" }, null, tx);
    }

    for (const referral of payload.referrals) {
      if (!referral.name.trim()) continue;
      if (referral.email && referral.email.toLowerCase() === payload.email.toLowerCase()) continue;
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
          null,
          tx,
        ));
      await addRelationship(
        {
          personId,
          relatedPersonId: referralId,
          kind: referral.kind ?? "knows",
          note: referral.how_known ?? null,
          source: "intake",
        },
        null,
        tx,
      );
    }

    return { personId, submissionId };
  });
}

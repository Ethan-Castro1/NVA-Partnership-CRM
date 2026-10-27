/**
 * The sign-up review pieces: possible matches with their reasons, then one
 * clear primary action (link to the strongest match, or approve as new), with
 * edit, reject and archive as quieter options. Admin pages only.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";
import { Check, Eye, EyeOff, Link2, Pencil, UserPlus, X } from "lucide-react";
import { Field, PersonAvatar, Sheet, StatusBadge } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useT, type MessageKey } from "~/i18n";
import { CONTRIBUTION_TYPES, LANGUAGES } from "~/lib/constants";
import type { DuplicateCandidate, DuplicateReason } from "~/lib/duplicates.server";
import type { IntakePayload } from "~/lib/intake-types";
import { cn } from "~/lib/utils";
import { CheckRow, FILLED, FILLED_AREA } from "./form-parts";

/** Every review form on a page shares this fetcher, so one busy state covers them all. */
export const REVIEW_FETCHER = "intake-review";

export type ReviewActionData =
  | { ok: true; done: "edited" | "new" }
  | { ok: false; error: MessageKey; fieldErrors?: Partial<Record<string, MessageKey>> };

function useReview() {
  const fetcher = useFetcher<ReviewActionData>({ key: REVIEW_FETCHER });
  const busy = fetcher.state !== "idle";
  const pendingIntent = busy ? fetcher.formData?.get("intent") : null;
  return { fetcher, busy, pendingIntent };
}

/** A strong match (same email or phone) is most likely the same person: linking becomes the primary action. */
export function isStrongMatch(candidate: DuplicateCandidate | undefined): boolean {
  return !!candidate && (candidate.reasons.includes("email") || candidate.reasons.includes("phone"));
}

export function ReasonChips({ reasons }: { reasons: DuplicateReason[] }) {
  const { t } = useT();
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <li key={reason} className="inline-flex h-6 items-center rounded-full bg-gold-soft px-2.5 text-xs font-medium text-gold-ink">
          {t(`admin.detail.reason.${reason}`)}
        </li>
      ))}
    </ul>
  );
}

export function VisibilityNote({ visible }: { visible: boolean }) {
  const { t } = useT();
  const Icon = visible ? Eye : EyeOff;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-smoke">
      <Icon className="size-3.5" aria-hidden="true" />
      {visible ? t("admin.detail.inDirectory") : t("admin.detail.hiddenFromStaff")}
    </span>
  );
}

/** Possible existing records, each with why it matched and a "Link to this record" action. */
export function MatchList({ duplicates, primaryId }: { duplicates: DuplicateCandidate[]; primaryId: string | null }) {
  const { t } = useT();
  if (!duplicates.length) return <p className="text-sm text-smoke">{t("admin.detail.matches.none")}</p>;
  return (
    <ul className="grid gap-3">
      {duplicates.map((candidate) => (
        <li key={candidate.id}>
          <MatchCard candidate={candidate} primary={candidate.id === primaryId} />
        </li>
      ))}
    </ul>
  );
}

function MatchCard({ candidate, primary }: { candidate: DuplicateCandidate; primary: boolean }) {
  const { t } = useT();
  const { fetcher, busy, pendingIntent } = useReview();
  const pendingHere = pendingIntent === "link" && fetcher.formData?.get("personId") === candidate.id;
  return (
    <Sheet className={cn("grid gap-3", primary && "ring-2 ring-gold")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={candidate.full_name} />
          <div className="grid min-w-0">
            <Link to={`/app/people/${candidate.id}`} target="_blank" rel="noreferrer" className="truncate font-medium underline-offset-4 hover:underline">
              {candidate.full_name}
            </Link>
            <span className="truncate text-xs text-smoke">
              {[candidate.organization_name, candidate.email, candidate.phone].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
        <StatusBadge status={candidate.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ReasonChips reasons={candidate.reasons} />
        <VisibilityNote visible={candidate.directory_visible} />
      </div>
      <fetcher.Form method="post" className="flex flex-wrap items-center justify-between gap-3 border-t border-stone pt-3">
        <input type="hidden" name="intent" value="link" />
        <input type="hidden" name="personId" value={candidate.id} />
        {candidate.directory_visible ? <span /> : <CheckRow name="show" label={t("admin.detail.showInDirectory")} defaultChecked={false} />}
        <Button type="submit" variant={primary ? "brand" : "outline"} disabled={busy}>
          <Link2 aria-hidden="true" />
          {pendingHere ? t("common.state.saving") : primary ? t("admin.detail.linkTo", { name: candidate.full_name }) : t("admin.detail.link")}
        </Button>
      </fetcher.Form>
    </Sheet>
  );
}

/** Approve as a new person: hidden from staff unless the admin ticks the box. */
export function ApproveForm({ primary }: { primary: boolean }) {
  const { t } = useT();
  const { fetcher, busy, pendingIntent } = useReview();
  return (
    <fetcher.Form method="post" className="grid gap-3">
      <input type="hidden" name="intent" value="approve" />
      <CheckRow name="show" label={t("admin.detail.showInDirectory")} defaultChecked={false} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={primary ? "brand" : "outline"} disabled={busy}>
          {primary ? <Check aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
          {pendingIntent === "approve" ? t("common.state.saving") : primary ? t("admin.detail.approve") : t("admin.detail.approveNew")}
        </Button>
      </div>
    </fetcher.Form>
  );
}

/** "Edit first" and "Reject": quiet buttons that open a small form in place. */
export function SecondaryActions({ payload }: { payload: IntakePayload }) {
  const { t } = useT();
  const { fetcher } = useReview();
  const [open, setOpen] = useState<"edit" | "reject" | null>(null);
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  // Keep the edit form open while it shows field errors.
  const editErrors = result && !result.ok ? result.fieldErrors : undefined;
  // Close the edit form once the changes are saved; keep it open while it shows field errors.
  useEffect(() => {
    if (result?.ok && result.done === "edited") setOpen(null);
    else if (result && !result.ok && result.fieldErrors) setOpen("edit");
  }, [result]);
  const shown = open;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" aria-expanded={shown === "edit"} onClick={() => setOpen(shown === "edit" ? null : "edit")}>
          <Pencil aria-hidden="true" />
          {t("admin.detail.edit")}
        </Button>
        <Button variant="ghost" size="sm" aria-expanded={shown === "reject"} onClick={() => setOpen(shown === "reject" ? null : "reject")}>
          <X aria-hidden="true" />
          {t("admin.detail.reject")}
        </Button>
      </div>
      {shown === "edit" && <EditForm payload={payload} errors={editErrors ?? {}} onCancel={() => setOpen(null)} />}
      {shown === "reject" && <RejectForm onCancel={() => setOpen(null)} />}
    </div>
  );
}

function RejectForm({ onCancel }: { onCancel: () => void }) {
  const { t } = useT();
  const { fetcher, busy, pendingIntent } = useReview();
  return (
    <Sheet>
      <fetcher.Form method="post" className="grid gap-3">
        <input type="hidden" name="intent" value="reject" />
        <h3 className="font-medium">{t("admin.detail.rejectTitle")}</h3>
        <Field label={t("admin.detail.rejectNote")} htmlFor="reject-note" optional>
          <Textarea id="reject-note" name="note" rows={2} maxLength={2000} className={FILLED_AREA} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="destructive" disabled={busy}>
            {pendingIntent === "reject" ? t("common.state.saving") : t("admin.detail.rejectConfirm")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("admin.detail.cancel")}
          </Button>
        </div>
      </fetcher.Form>
    </Sheet>
  );
}

function EditForm({
  payload: p,
  errors,
  onCancel,
}: {
  payload: IntakePayload;
  errors: Partial<Record<string, MessageKey>>;
  onCancel: () => void;
}) {
  const { t } = useT();
  const { fetcher, busy, pendingIntent } = useReview();
  const err = (field: string) => (errors[field] ? t(errors[field]!) : undefined);
  return (
    <Sheet>
      <fetcher.Form method="post" className="grid gap-4" noValidate>
        <input type="hidden" name="intent" value="edit" />
        <h3 className="font-medium">{t("admin.detail.editTitle")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.field.name")} htmlFor="edit-name" error={err("full_name")} className="sm:col-span-2">
            <Input id="edit-name" name="full_name" required maxLength={120} defaultValue={p.full_name} className={FILLED} aria-invalid={!!errors.full_name || undefined} />
          </Field>
          <Field label={t("common.field.email")} htmlFor="edit-email" error={err("email")}>
            <Input id="edit-email" name="email" type="email" maxLength={200} defaultValue={p.email} className={FILLED} aria-invalid={!!errors.email || undefined} />
          </Field>
          <Field label={t("common.field.phone")} htmlFor="edit-phone" optional error={err("phone")}>
            <Input id="edit-phone" name="phone" type="tel" maxLength={40} defaultValue={p.phone ?? ""} className={FILLED} />
          </Field>
          <Field label={t("common.field.organization")} htmlFor="edit-org" optional>
            <Input id="edit-org" name="organization" maxLength={160} defaultValue={p.organization ?? ""} className={FILLED} />
          </Field>
          <Field label={t("common.field.title")} htmlFor="edit-title" optional>
            <Input id="edit-title" name="title" maxLength={120} defaultValue={p.title ?? ""} className={FILLED} />
          </Field>
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium text-graphite">{t("common.field.language")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {LANGUAGES.map((lang) => (
              <label key={lang} className="flex items-center gap-2 text-sm">
                <input type="radio" name="preferred_language" value={lang} defaultChecked={p.preferred_language === lang} className="accent-black" />
                {t(`common.language.${lang}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium text-graphite">{t("common.field.contributions")}</legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {CONTRIBUTION_TYPES.map((type) => (
              <CheckRow
                key={type}
                name="contribution_types"
                value={type}
                label={t(`common.contribution.${type}`)}
                defaultChecked={p.contribution_types.includes(type)}
              />
            ))}
          </div>
        </fieldset>
        <Field label={t("common.field.skills")} htmlFor="edit-skills" optional hint={t("admin.detail.skillsHint")}>
          <Input id="edit-skills" name="skills" maxLength={1000} defaultValue={p.skills.join(", ")} className={FILLED} />
        </Field>
        <Field label={t("common.field.availability")} htmlFor="edit-availability" optional>
          <Textarea id="edit-availability" name="availability" rows={2} maxLength={500} defaultValue={p.availability ?? ""} className={FILLED_AREA} />
        </Field>
        <Field label={t("common.field.bio")} htmlFor="edit-bio" optional>
          <Textarea id="edit-bio" name="bio" rows={3} maxLength={2000} defaultValue={p.bio ?? ""} className={FILLED_AREA} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" disabled={busy}>
            {pendingIntent === "edit" ? t("common.state.saving") : t("admin.detail.saveEdits")}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("admin.detail.cancel")}
          </Button>
        </div>
      </fetcher.Form>
    </Sheet>
  );
}

/**
 * The note shown after a decision redirects to the next sign-up (or the list):
 * ?done=approved|linked|rejected|archived, plus &person=<id> for a profile link
 * and &from=<submission id> so the loader can name who was decided.
 */
export function DoneNotice({
  fallback,
  name,
  next = false,
}: {
  fallback?: ReactNode;
  /** Who the decision was about (so the note can't be read as being about the sign-up now on screen). */
  name?: string | null;
  /** True on the next sign-up's page: says the one below is a different person. */
  next?: boolean;
}) {
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const done = searchParams.get("done");
  const person = searchParams.get("person");
  const known = done === "approved" || done === "linked" || done === "rejected" || done === "archived";
  if (!known) return done ? <>{fallback}</> : null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink">
      <span>
        {name ? t(`admin.detail.doneNamed.${done}`, { name }) : t(`admin.detail.done.${done}`)}
        {next && <> {t("admin.detail.nextBelow")}</>}
      </span>
      {person && (done === "approved" || done === "linked") && (
        <Link to={`/app/people/${person}`} className="font-medium underline underline-offset-4">
          {t("admin.detail.openProfile")}
        </Link>
      )}
    </p>
  );
}

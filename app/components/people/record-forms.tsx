/**
 * The small forms on a profile: record an interaction (admins: calls,
 * meetings, notes, emails and work; staff: only the work itself), add a
 * connection and add to a CAP (admins). Each posts through its own fetcher so
 * the rest of the page stays put; on success the form clears and a short
 * confirmation is announced. The route action checks the role for every one.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { useT, type MessageKey } from "~/i18n";
import { ADMIN_LOGGABLE_KINDS, RELATIONSHIP_KINDS, type EngagementKind } from "~/lib/constants";
import { NamedSelect, type SelectOption } from "./named-select";

export type ProfileActionData =
  | { ok: true; intent: string }
  | { ok: false; intent: string; errors: Partial<Record<string, MessageKey>> };

/** A fetcher whose form remounts (clears) after each successful save. */
function useRecordFetcher(intent: string) {
  const fetcher = useFetcher<ProfileActionData>();
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState(false);
  const data = fetcher.data?.intent === intent ? fetcher.data : undefined;
  useEffect(() => {
    if (fetcher.state === "idle" && data?.ok) {
      setFormKey((k) => k + 1);
      setSaved(true);
    }
  }, [fetcher.state, data]);
  useEffect(() => {
    if (fetcher.state === "submitting") setSaved(false);
  }, [fetcher.state]);
  const errors = data && !data.ok ? data.errors : {};
  return { fetcher, formKey, saved, errors, busy: fetcher.state !== "idle" };
}

function SavedNote({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <p role="status" className="flex min-h-5 items-center gap-1.5 text-sm text-sage-ink">
      {show && (
        <>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {children}
        </>
      )}
    </p>
  );
}

function FormError({ errors }: { errors: Partial<Record<string, MessageKey>> }) {
  const { t } = useT();
  return errors._form ? (
    <p role="alert" className="rounded-xl bg-rust-soft px-3.5 py-2.5 text-sm text-rust-ink">
      {t(errors._form)}
    </p>
  ) : null;
}

export function LogActivityForm({
  caps,
  today,
  defaultCap,
  kinds = ADMIN_LOGGABLE_KINDS,
  defaultKind,
  submitLabel,
  savedLabel,
}: {
  caps: SelectOption[];
  today: string;
  defaultCap?: string;
  /** What this viewer may log (staff: STAFF_LOGGABLE_KINDS). The server checks again. */
  kinds?: readonly EngagementKind[];
  defaultKind?: EngagementKind;
  submitLabel?: string;
  savedLabel?: string;
}) {
  const { t } = useT();
  const { fetcher, formKey, saved, errors, busy } = useRecordFetcher("logEngagement");
  const err = (key: string) => (errors[key] ? t(errors[key]!) : undefined);
  return (
    <fetcher.Form key={formKey} method="post" className="grid gap-4">
      <input type="hidden" name="intent" value="logEngagement" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("people.profile.logKind")} htmlFor="log-kind" error={err("kind")}>
          <NamedSelect
            id="log-kind"
            name="kind"
            defaultValue={defaultKind && kinds.includes(defaultKind) ? defaultKind : kinds[0]}
            invalid={!!errors.kind}
            options={kinds.map((k) => ({ value: k, label: t(`common.engagement.${k}`) }))}
          />
        </Field>
        <Field label={t("people.profile.logDate")} htmlFor="log-date" error={err("happened_on")}>
          <Input id="log-date" name="happened_on" type="date" defaultValue={today} aria-invalid={!!errors.happened_on || undefined} />
        </Field>
      </div>
      {caps.length > 0 && (
        <Field label={t("people.profile.logCap")} htmlFor="log-cap" optional>
          <NamedSelect
            id="log-cap"
            name="cap_id"
            defaultValue={defaultCap ?? "none"}
            options={[{ value: "none", label: t("people.profile.logNoCap") }, ...caps]}
          />
        </Field>
      )}
      <Field label={t("people.profile.logNotes")} htmlFor="log-notes" optional error={err("notes")}>
        <Textarea
          id="log-notes"
          name="notes"
          maxLength={4000}
          rows={3}
          placeholder={t("people.profile.logNotesPlaceholder")}
          className="bg-canvas"
        />
      </Field>
      <FormError errors={errors} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t("common.state.saving") : (submitLabel ?? t("people.profile.logSubmit"))}
        </Button>
        <SavedNote show={saved}>{savedLabel ?? t("people.profile.logSaved")}</SavedNote>
      </div>
    </fetcher.Form>
  );
}

export function ConnectionForm({ people, personName }: { people: SelectOption[]; personName: string }) {
  const { t } = useT();
  const { fetcher, formKey, saved, errors, busy } = useRecordFetcher("addConnection");
  const err = (key: string) => (errors[key] ? t(errors[key]!) : undefined);
  if (!people.length) return <p className="text-sm text-smoke">{t("people.profile.connNoPeople")}</p>;
  return (
    <fetcher.Form key={formKey} method="post" className="grid gap-4">
      <input type="hidden" name="intent" value="addConnection" />
      <div className="grid gap-4">
        <Field label={t("people.profile.connPerson")} htmlFor="conn-person" error={err("related_person_id")}>
          <NamedSelect
            id="conn-person"
            name="related_person_id"
            placeholder={t("people.profile.connChoose")}
            invalid={!!errors.related_person_id}
            required
            options={people}
          />
        </Field>
        <Field
          label={t("people.profile.connKind")}
          htmlFor="conn-kind"
          hint={t("people.profile.connKindHint", { name: personName })}
          error={err("kind")}
        >
          <NamedSelect
            id="conn-kind"
            name="kind"
            defaultValue="knows"
            invalid={!!errors.kind}
            options={RELATIONSHIP_KINDS.map((k) => ({ value: k, label: t(`common.relationship.${k}`) }))}
          />
        </Field>
      </div>
      <Field label={t("people.profile.connNote")} htmlFor="conn-note" optional error={err("note")}>
        <Input id="conn-note" name="note" maxLength={500} placeholder={t("people.profile.connNotePlaceholder")} />
      </Field>
      <FormError errors={errors} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t("common.state.saving") : t("people.profile.connSubmit")}
        </Button>
        <SavedNote show={saved}>{t("people.profile.connSaved")}</SavedNote>
      </div>
    </fetcher.Form>
  );
}

export function CapForm({ caps }: { caps: SelectOption[] }) {
  const { t } = useT();
  const { fetcher, formKey, saved, errors, busy } = useRecordFetcher("addToCap");
  const err = (key: string) => (errors[key] ? t(errors[key]!) : undefined);
  if (!caps.length) return <p className="text-sm text-smoke">{t("people.profile.capNone")}</p>;
  return (
    <fetcher.Form key={formKey} method="post" className="grid gap-4">
      <input type="hidden" name="intent" value="addToCap" />
      <div className="grid gap-4">
        <Field label={t("people.profile.capLabel")} htmlFor="cap-id" error={err("cap_id")}>
          <NamedSelect
            id="cap-id"
            name="cap_id"
            placeholder={t("people.profile.capChoose")}
            invalid={!!errors.cap_id}
            required
            options={caps}
          />
        </Field>
        <Field label={t("people.profile.capRole")} htmlFor="cap-role" optional error={err("role")}>
          <Input id="cap-role" name="role" maxLength={200} placeholder={t("people.profile.capRolePlaceholder")} />
        </Field>
      </div>
      <FormError errors={errors} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t("common.state.saving") : t("people.profile.capSubmit")}
        </Button>
        <SavedNote show={saved}>{t("people.profile.capSaved")}</SavedNote>
      </div>
    </fetcher.Form>
  );
}

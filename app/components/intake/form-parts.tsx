/**
 * Pieces of the public sign-up form. They use native checkboxes and radios
 * (styled) instead of the radix ones so the form works before, or without,
 * JavaScript: every value posts as a plain form field.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";
import { Field } from "~/components/nva";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useT } from "~/i18n";
import { CONTRIBUTION_COLOR, type ContributionType } from "~/lib/constants";
import { cn } from "~/lib/utils";
import { REFERRAL_SLOTS, isBlankReferral, type IntakeErrors, type ReferralRowValues } from "./form-types";

/** The soft filled input look from the visual reference. */
export const FILLED = "h-11 border-transparent bg-taupe";
export const FILLED_AREA = "min-h-24 border-transparent bg-taupe";

/** A visible "*" for required fields; the input itself carries `required` for screen readers. */
export function Req({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <span aria-hidden="true" className="text-rust-ink">
        {" "}
        *
      </span>
    </>
  );
}

/** A form section: fieldset with a small heading, optional hint and group error. */
export function FormSection({
  legend,
  hint,
  error,
  errorId,
  children,
  className,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  errorId?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("grid gap-4 border-t border-stone pt-7", className)} aria-describedby={error ? errorId : undefined}>
      <div className="space-y-1">
        <legend className="text-section">{legend}</legend>
        {hint && <p className="text-sm text-smoke">{hint}</p>}
        {error && (
          <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
      {children}
    </fieldset>
  );
}

const FOCUS_WITHIN = "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

/** Large checkbox card for one way to help: coloured dot, long label, help text. */
export function ContributionCard({ type, defaultChecked }: { type: ContributionType; defaultChecked: boolean }) {
  const { t } = useT();
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-2xl border border-stone bg-canvas p-4 transition-colors hover:border-ash",
        "has-[:checked]:border-gold has-[:checked]:bg-gold-soft/50",
        FOCUS_WITHIN,
      )}
    >
      <input
        type="checkbox"
        name="contribution_types"
        value={type}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 accent-black"
      />
      <span className="grid gap-1">
        <span className="flex items-center gap-2 font-medium text-ink">
          <span className={cn("size-2.5 shrink-0 rounded-full", CONTRIBUTION_COLOR[type].dot)} aria-hidden="true" />
          {t(`common.contributionLong.${type}`)}
        </span>
        <span className="text-sm leading-snug text-smoke">{t(`common.contributionHelp.${type}`)}</span>
      </span>
    </label>
  );
}

/** A toggleable pill backed by a hidden native checkbox. Checked pills turn black and show a tick. */
export function PillCheckbox({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-stone bg-canvas px-3.5 text-sm text-graphite transition-colors hover:bg-taupe",
        "has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-canvas",
        FOCUS_WITHIN,
      )}
    >
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <Check className="hidden size-3.5 peer-checked:block" aria-hidden="true" />
      {label}
    </label>
  );
}

/** A plain checkbox with its label, for short options. */
export function CheckRow({
  name,
  value,
  label,
  defaultChecked,
  required,
  invalid,
  describedBy,
}: {
  name: string;
  value?: string;
  label: ReactNode;
  defaultChecked: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1 text-sm text-graphite", FOCUS_WITHIN)}>
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="mt-0.5 size-4 shrink-0 accent-black"
      />
      <span>{label}</span>
    </label>
  );
}

/** Radio pills (e.g. preferred language). */
export function RadioPills({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-taupe px-4 text-sm text-graphite transition-colors",
            "has-[:checked]:bg-ink has-[:checked]:text-canvas",
            FOCUS_WITHIN,
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
            className="peer sr-only"
          />
          <Check className="hidden size-3.5 peer-checked:block" aria-hidden="true" />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/**
 * Up to three people the visitor suggests. The first row always renders (so
 * it works without JavaScript); "Add another person" appears once the page
 * is interactive. Inputs are named by slot so removing a row never shifts
 * what the others typed.
 */
export function ReferralRows({ rows, errors }: { rows: ReferralRowValues[]; errors: IntakeErrors }) {
  const { t } = useT();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Show every slot that came back filled from the server, and always the first.
  const initial = rows.map((row, slot) => (slot === 0 || !isBlankReferral(row) ? slot : -1)).filter((slot) => slot >= 0);
  const [slots, setSlots] = useState<number[]>(initial);

  const add = () => {
    const free = Array.from({ length: REFERRAL_SLOTS }, (_, i) => i).find((i) => !slots.includes(i));
    if (free !== undefined) setSlots([...slots, free]);
  };
  const remove = (slot: number) => setSlots(slots.filter((s) => s !== slot));

  return (
    <div className="grid gap-4">
      {slots.map((slot, position) => {
        const row = rows[slot];
        const err = (field: string) => errors[`referrals.${slot}.${field}`];
        const id = (field: string) => `ref-${field}-${slot}`;
        return (
          <div key={slot} className="grid gap-3 rounded-2xl border border-stone p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-eyebrow text-graphite">{t("intake.referral.person", { n: position + 1 })}</h3>
              {hydrated && slots.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(slot)}
                  aria-label={t("intake.referral.remove", { n: position + 1 })}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("intake.referral.name")} htmlFor={id("name")} error={err("name") && t(err("name")!)}>
                <Input
                  id={id("name")}
                  name={`ref_name_${slot}`}
                  defaultValue={row?.name}
                  maxLength={120}
                  autoComplete="off"
                  aria-invalid={!!err("name") || undefined}
                  className={FILLED}
                />
              </Field>
              <Field label={t("intake.referral.contact")} htmlFor={id("contact")} error={err("contact") && t(err("contact")!)}>
                <Input
                  id={id("contact")}
                  name={`ref_contact_${slot}`}
                  defaultValue={row?.contact}
                  maxLength={200}
                  autoComplete="off"
                  aria-invalid={!!err("contact") || undefined}
                  className={FILLED}
                />
              </Field>
              <Field label={t("intake.referral.howKnown")} htmlFor={id("how")} error={err("how_known") && t(err("how_known")!)}>
                <Input
                  id={id("how")}
                  name={`ref_how_${slot}`}
                  defaultValue={row?.how_known}
                  maxLength={300}
                  placeholder={t("intake.referral.howKnownPlaceholder")}
                  className={FILLED}
                />
              </Field>
              <Field label={t("intake.referral.canHelp")} htmlFor={id("help")} error={err("can_help_with") && t(err("can_help_with")!)}>
                <Input
                  id={id("help")}
                  name={`ref_help_${slot}`}
                  defaultValue={row?.can_help_with}
                  maxLength={500}
                  placeholder={t("intake.referral.canHelpPlaceholder")}
                  className={FILLED}
                />
              </Field>
            </div>
          </div>
        );
      })}
      {hydrated && slots.length < REFERRAL_SLOTS && (
        <Button type="button" variant="outline" onClick={add} className="justify-self-start">
          <Plus aria-hidden="true" />
          {t("intake.referral.add")}
        </Button>
      )}
    </div>
  );
}

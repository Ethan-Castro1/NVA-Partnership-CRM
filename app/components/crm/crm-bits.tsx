/**
 * Small shared pieces for the opportunity and follow-up screens: the stage
 * badge, a select that posts with its form, segmented tabs, and date labels.
 */
import { Link } from "react-router";
import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useT, type Locale } from "~/i18n";
import type { OpportunityStage } from "~/lib/constants";
import { daysBetween } from "~/lib/dates";
import { cn } from "~/lib/utils";

const STAGE_DOT: Record<OpportunityStage, string> = {
  not_contacted: "bg-ash",
  identified: "bg-ash",
  contacted: "bg-blue",
  cultivating: "bg-blue",
  committed: "bg-purple",
  proposal_submitted: "bg-purple",
  completed: "bg-sage",
  awarded: "bg-sage",
  closed_declined: "bg-rust",
  declined: "bg-rust",
  canceled: "bg-stone",
};

/** The stage as a quiet pill with a coloured dot. */
export function StageBadge({ stage, className }: { stage: OpportunityStage; className?: string }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-stone bg-canvas px-2.5 text-xs whitespace-nowrap text-graphite",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", STAGE_DOT[stage] ?? "bg-ash")} aria-hidden="true" />
      {t(`common.stage.${stage}`)}
    </span>
  );
}

export function stageDot(stage: OpportunityStage): string {
  return STAGE_DOT[stage] ?? "bg-ash";
}

export type CrmOption = { value: string; label: string };

/**
 * A shadcn Select that posts with its form (Radix renders a hidden native
 * select inside a <form>). Radix forbids "" as a value, so "nothing chosen"
 * uses "none", which the server treats as empty.
 */
export function CrmSelect({
  id,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  invalid,
  describedBy,
  required,
  className,
}: {
  id: string;
  name: string;
  options: CrmOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Select
      name={name}
      value={value}
      defaultValue={value === undefined ? defaultValue || undefined : undefined}
      onValueChange={onValueChange}
      required={required}
    >
      <SelectTrigger id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={cn("h-10 w-full bg-canvas", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Pill tabs made of links (filters that live in the URL). */
export function SegmentedLinks({
  label,
  tabs,
}: {
  label: string;
  tabs: { to: string; label: ReactNode; current: boolean; count?: number }[];
}) {
  return (
    <nav aria-label={label} className="min-w-0 max-w-full overflow-x-auto">
      <ul className="inline-flex rounded-full border border-stone bg-taupe p-1">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              preventScrollReset
              aria-current={tab.current ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                tab.current ? "bg-canvas font-medium text-ink shadow-whisper" : "text-graphite hover:text-ink",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", tab.current ? "bg-stone text-ink" : "text-smoke")}>{tab.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "Oct 22" (this year) or "Oct 22, 2027". Plain dates are read at noon UTC so no time zone moves them. */
export function crmDate(iso: string | null | undefined, locale: Locale, today?: string): string {
  if (!iso) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = dateOnly ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = today ? iso.slice(0, 4) === today.slice(0, 4) : false;
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: dateOnly ? "UTC" : "America/New_York",
  }).format(date);
}

/** Days a YYYY-MM-DD date is past `today` (0 when not past). */
export function daysOverdue(dueOn: string, today: string): number {
  try {
    return Math.max(0, daysBetween(dueOn, today));
  } catch {
    return 0;
  }
}

/**
 * Small display helpers shared by the admin pages. Dates are shown in the
 * school's time zone so the server render and the browser agree.
 */
import { useT } from "~/i18n";
import type { Locale } from "~/i18n";
import { cn } from "~/lib/utils";

const SCHOOL_TZ = "America/New_York";
const intlLocale = (locale: Locale) => (locale === "es" ? "es-US" : "en-US");

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: SCHOOL_TZ }).format(date);
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: SCHOOL_TZ }).format(date);
}

/** For DATE columns ("2026-10-02"): no time zone shifting. */
export function formatDay(day: string | null | undefined, locale: Locale): string {
  if (!day) return "";
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string, locale: Locale, now = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((date.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}

/** "3 days ago", with the full date on hover and in the markup. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const { locale } = useT();
  return (
    <time dateTime={iso} title={formatDateTime(iso, locale)} className={className} suppressHydrationWarning>
      {relativeTime(iso, locale)}
    </time>
  );
}

const INTAKE_STYLE = {
  new: "bg-gold-soft text-gold-ink",
  reviewed: "bg-sage-soft text-sage-ink",
  archived: "bg-stone text-smoke",
} as const;

export function IntakeStatusBadge({ status, className }: { status: keyof typeof INTAKE_STYLE; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[0.7rem] font-medium", INTAKE_STYLE[status], className)}>
      {t(`admin.detail.status.${status}`)}
    </span>
  );
}

// No look-alike characters (0/O, 1/l/I), so a password read aloud or copied by hand still works.
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!?";

/** A random temporary password, made in the browser with the Web Crypto API. */
export function generatePassword(length = 14): string {
  const out: string[] = [];
  const bytes = new Uint8Array(1);
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % PASSWORD_CHARS.length);
  while (out.length < length) {
    crypto.getRandomValues(bytes);
    if (bytes[0] < limit) out.push(PASSWORD_CHARS[bytes[0] % PASSWORD_CHARS.length]);
  }
  return out.join("");
}

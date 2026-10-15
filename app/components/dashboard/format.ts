import type { Locale } from "~/i18n";

const intlLocale = (locale: Locale) => (locale === "es" ? "es-US" : "en-US");

/**
 * Short date ("Oct 15" / "15 oct"). A fixed time zone keeps the server and the
 * browser rendering the same text (no hydration mismatch).
 */
export function shortDate(value: string, locale: Locale): string {
  // Plain calendar dates are read at noon UTC so no time zone can move them a day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric", timeZone: "America/New_York" });
}

/** Today in Annapolis, written out ("Thursday, October 15, 2026"). */
export function longToday(locale: Locale, now = new Date()): string {
  return now.toLocaleDateString(intlLocale(locale), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

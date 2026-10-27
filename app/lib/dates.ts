/**
 * Calendar dates at the school. "Today" is today in Annapolis (America/New_York),
 * not on the server's clock or in the database: pass schoolToday() into SQL as a
 * parameter instead of comparing with CURRENT_DATE. Dates are YYYY-MM-DD strings.
 * Safe to import in the browser too (no server code).
 */

export const SCHOOL_TIME_ZONE = "America/New_York";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date at the school, as YYYY-MM-DD. */
export function schoolToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** True for a real calendar date written YYYY-MM-DD (2026-02-30 is not one). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** The date n days after (or before, when n is negative) a YYYY-MM-DD date. */
export function addDays(iso: string, n: number): string {
  if (!isIsoDate(iso)) throw new RangeError(`Not a YYYY-MM-DD date: ${iso}`);
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.trunc(n));
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new RangeError("Not a YYYY-MM-DD date");
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A DATE value from Postgres or PGlite (a Date at UTC midnight, or a string) as YYYY-MM-DD. */
export function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value);
  return ISO_DATE.test(text.slice(0, 10)) ? text.slice(0, 10) : null;
}

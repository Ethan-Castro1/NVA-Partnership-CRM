/**
 * Small display helpers for the people pages. Dates are formatted in the
 * school's time zone so the server render and the browser always agree.
 */
import { Fragment, createElement, type ReactNode } from "react";
import type { Locale } from "~/i18n";

export const SCHOOL_TIME_ZONE = "America/New_York";

/** "Oct 15, 2026" / "15 oct 2026". Accepts timestamps, Dates or plain YYYY-MM-DD dates. */
export function formatDate(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return "";
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    dateStyle: "medium",
    timeZone: dateOnly ? "UTC" : SCHOOL_TIME_ZONE,
  }).format(date);
}

/** Machine-readable value for <time dateTime>. */
export function isoDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Today's date at the school, as YYYY-MM-DD (the default for "Log activity"). */
export function schoolToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(now);
}

/**
 * Renders a translated sentence with a React node where "{name}" was, so a
 * name inside "Referred by {name}" can be a link in any language's word order.
 */
export function withNode(template: string, node: ReactNode, token = "{name}"): ReactNode {
  const at = template.indexOf(token);
  if (at === -1) return template;
  return createElement(Fragment, null, template.slice(0, at), node, template.slice(at + token.length));
}

/** "carpentry" -> "Carpentry", for skills typed in lowercase. Leaves the rest of the text alone. */
export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

/**
 * Every page is bilingual. Text lives in one file per feature (this folder);
 * each file's Spanish must have the same keys as its English.
 *
 *   const { t, locale } = useT();
 *   t("people.title")                    // namespace.key
 *   t("people.resultCount", { count })   // {count} in the string
 *
 * Words for database values (contribution types, statuses, ...) are in
 * common.ts, e.g. t(`common.contribution.${type}`).
 */
import { useRouteLoaderData } from "react-router";
import account from "./account";
import admin from "./admin";
import assistant from "./assistant";
import auth from "./auth";
import caps from "./caps";
import common from "./common";
import connections from "./connections";
import dashboard from "./dashboard";
import type { Locale } from "./define";
import intake from "./intake";
import people from "./people";
import publicPages from "./public";

export type { Locale } from "./define";
export { LOCALES } from "./define";

const namespaces = {
  common,
  auth,
  public: publicPages,
  intake,
  dashboard,
  people,
  assistant,
  connections,
  caps,
  admin,
  account,
};
type Namespaces = typeof namespaces;

export type MessageKey = {
  [N in keyof Namespaces]: `${N & string}.${keyof Namespaces[N]["en"] & string}`;
}[keyof Namespaces];

export type TranslateVars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: TranslateVars) => string;

export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const dot = key.indexOf(".");
  const ns = namespaces[key.slice(0, dot) as keyof Namespaces] as { en: Record<string, string>; es: Record<string, string> };
  const name = key.slice(dot + 1);
  let text = ns?.[locale]?.[name] ?? ns?.en?.[name] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

/** For dynamic keys built from database values. Falls back to the raw value. */
export function translateMaybe(locale: Locale, key: string, fallback: string): string {
  const text = translate(locale, key as MessageKey);
  return text === key ? fallback : text;
}

export function makeT(locale: Locale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}

/** In components: the current locale (from the root loader) and its t(). */
export function useT(): { t: TFunction; locale: Locale; tx: (key: string, fallback?: string) => string } {
  const data = useRouteLoaderData("root") as { locale?: Locale } | undefined;
  const locale: Locale = data?.locale === "es" ? "es" : "en";
  return {
    locale,
    t: (key, vars) => translate(locale, key, vars),
    tx: (key, fallback) => translateMaybe(locale, key, fallback ?? key.split(".").pop() ?? key),
  };
}

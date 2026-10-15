export type Locale = "en" | "es";
export const LOCALES: readonly Locale[] = ["en", "es"];

/**
 * One namespace of UI text. Spanish must have exactly the English keys, so
 * TypeScript flags any string that is missing a translation.
 * Use {name} placeholders for values: t("people.count", { count: 3 }).
 */
export function defineMessages<const T extends Record<string, string>>(
  en: T,
  es: { [K in keyof T]: string },
): { en: T; es: { [K in keyof T]: string } } {
  return { en, es };
}

import type { Locale } from "./define";

const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The visitor's chosen language, as a plain "en" / "es" cookie (readable by
 * scripts and easy to set in tests: Cookie: nva_lang=es).
 */
export const langCookie = {
  async serialize(locale: Locale): Promise<string> {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `nva_lang=${locale}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
  },
  async parse(cookieHeader: string | null): Promise<Locale | null> {
    const match = /(?:^|;\s*)nva_lang=([^;]*)/.exec(cookieHeader ?? "");
    const value = match?.[1] ?? null;
    // Older cookies were React Router-encoded ("ImVzIg==" is base64 JSON for "es").
    if (value === "es" || value === "ImVzIg==") return "es";
    if (value === "en" || value === "ImVuIg==") return "en";
    return null;
  },
};

/** Chosen language cookie, then the staff member's saved language, then the browser's. */
export async function getLocale(request: Request, userLocale?: Locale | null): Promise<Locale> {
  const chosen = await langCookie.parse(request.headers.get("Cookie"));
  if (chosen) return chosen;
  if (userLocale) return userLocale;
  const accept = request.headers.get("Accept-Language") ?? "";
  return /^\s*es\b/i.test(accept) ? "es" : "en";
}

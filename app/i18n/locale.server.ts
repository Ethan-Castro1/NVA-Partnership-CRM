import { createCookie } from "react-router";
import type { Locale } from "./define";

export const langCookie = createCookie("nva_lang", {
  httpOnly: false,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
});

/** Chosen language cookie, then the staff member's saved language, then the browser's. */
export async function getLocale(request: Request, userLocale?: Locale | null): Promise<Locale> {
  const chosen = await langCookie.parse(request.headers.get("Cookie"));
  if (chosen === "en" || chosen === "es") return chosen;
  if (userLocale) return userLocale;
  const accept = request.headers.get("Accept-Language") ?? "";
  return /^\s*es\b/i.test(accept) ? "es" : "en";
}

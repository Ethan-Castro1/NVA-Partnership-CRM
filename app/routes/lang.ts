/** POST { locale, redirectTo }: remembers the language and returns to the page. */
import { redirect } from "react-router";
import type { Route } from "./+types/lang";
import { langCookie } from "~/i18n/locale.server";
import { getUser, safeNext } from "~/lib/auth.server";
import { query } from "~/lib/db.server";

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const locale = form.get("locale") === "es" ? "es" : "en";
  const user = await getUser(request);
  if (user) await query("UPDATE users SET locale = $2 WHERE id = $1", [user.id, locale]);
  return redirect(safeNext(String(form.get("redirectTo") ?? ""), "/"), {
    headers: { "Set-Cookie": await langCookie.serialize(locale) },
  });
}

export function loader() {
  return redirect("/");
}

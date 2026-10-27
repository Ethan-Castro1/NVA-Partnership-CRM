/** /app/admin: the admin overview now lives on the dashboard at /app. */
import { redirect } from "react-router";
import type { Route } from "./+types/app.admin._index";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return redirect("/app");
}

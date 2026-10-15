import type { Route } from "./+types/app.admin.export";
import { requireAdmin } from "~/lib/auth.server";

// Placeholder: built in the feature pass.
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return new Response("", { headers: { "Content-Type": "text/csv; charset=utf-8" } });
}
